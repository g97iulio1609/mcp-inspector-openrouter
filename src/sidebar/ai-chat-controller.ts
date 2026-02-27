/**
 * ai-chat-controller.ts — Handles AI chat initialization, prompt suggestion, and message sending.
 */

import type {
  CleanTool,
  PageContext,
  ScreenshotResponse,
  ContentPart,
} from '../types';
import type { ToolDefinition } from '../ports/types';
import { OpenRouterAdapter, OpenRouterChat } from '../services/adapters';
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODEL,
  STORAGE_KEY_SCREENSHOT_ENABLED,
  STORAGE_KEY_ORCHESTRATOR_MODE,
  STORAGE_KEY_YOLO_MODE,
  STORAGE_KEY_ADAPTIVE_FILTERING,
  DEFAULT_MODEL,
} from '../utils/constants';
import * as Store from './chat-store';
import { buildChatConfig } from './config-builder';
import type { PlanManager } from './plan-manager';
import { executeToolLoop } from './tool-loop';
import {
  DeepAgent,
  createRuntimeAdapter,
  InMemoryAdapter,
  type AgentEvent
} from 'onegenui-deep-agents';
import { createChromeToolSet, createMacroToolSet } from '../adapters/chrome-tool-adapter';
import { aggregate } from '../content/tool-aggregator';

import type { IPlanningPort } from '../ports/planning.port';
import { getSecurityTier } from '../content/merge';
import { showApprovalDialog } from './security-dialog';
import type { SecurityDialog } from '../components/security-dialog';
import type { ConversationController } from './conversation-controller';
import type { ChatHeader } from '../components/chat-header';
import type { ChatInput } from '../components/chat-input';
import { createMentionAutocomplete, type MentionAutocomplete, type TabMention } from './tab-mention';
import type { IResettable } from './state-manager';
import { logger } from './debug-logger';

export interface AIChatDeps {
  readonly chatInput: ChatInput;
  readonly chatHeader: ChatHeader;
  readonly getCurrentTab: () => Promise<chrome.tabs.Tab | undefined>;
  readonly getCurrentTools: () => CleanTool[];
  readonly setCurrentTools: (tools: CleanTool[]) => void;
  readonly convCtrl: ConversationController;
  readonly planManager: PlanManager;
  readonly securityDialogEl: SecurityDialog;
}

export class AIChatController implements IResettable {
  private genAI: OpenRouterAdapter | undefined;
  private userPromptPendingId = 0;
  private lastSuggestedUserPrompt = '';
  private readonly deps: AIChatDeps;
  private mentionAC: MentionAutocomplete | undefined;
  private activeMentions: TabMention[] = [];
  /** Pinned conversation coordinates for the in-flight request. */
  private pinnedConv: { site: string; convId: string } | null = null;
  private agents: Record<string, DeepAgent> = {};

  constructor(deps: AIChatDeps) {
    this.deps = deps;
  }

  resetOnConversationChange(): void {
    this.activeMentions = [];
    this.userPromptPendingId++;
    this.lastSuggestedUserPrompt = '';
    this.deps.chatInput.setPresets([]);
    for (const agent of Object.values(this.agents)) {
      agent.dispose().catch(console.error);
    }
    this.agents = {};
    // pinnedConv is NOT reset here — it's self-cleaning inside promptAI()
    // and resetting it mid-flight would mis-route error messages
  }

  async init(): Promise<void> {
    const result = await chrome.storage.local.get([STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL]);
    let savedApiKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
    const savedModel = (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;

    if (!savedApiKey) {
      try {
        const res = await fetch('./.env.json');
        if (res.ok) {
          const env = (await res.json()) as { apiKey?: string; model?: string };
          if (env?.apiKey) {
            savedApiKey = env.apiKey;
            await chrome.storage.local.set({
              [STORAGE_KEY_API_KEY]: savedApiKey,
              [STORAGE_KEY_MODEL]: env.model ?? savedModel,
            });
          }
        }
      } catch { /* no env file */ }
    }

    if (savedApiKey) {
      this.genAI = new OpenRouterAdapter({ apiKey: savedApiKey, model: savedModel });
      this.deps.chatInput.disabled = false;
      this.deps.chatHeader.setApiKeyHint(false);
    } else {
      this.genAI = undefined;
      this.deps.chatInput.disabled = true;
      this.deps.chatHeader.setApiKeyHint(true);
    }
  }

  setupListeners(): void {
    const { chatInput, convCtrl } = this.deps;

    chatInput.addEventListener('send-message', async (e: Event): Promise<void> => {
      const message = (e as CustomEvent<{ message: string }>).detail.message;
      try {
        await this.promptAI(message);
      } catch (error) {
        convCtrl.state.trace.push({ error });
        convCtrl.addAndRender('error', 'Sorry, something went wrong. Please try again.', {}, this.pinnedConv ?? undefined);
      }
    });

    // @mention autocomplete — clean up previous instance
    this.mentionAC?.destroy();
    this.mentionAC = createMentionAutocomplete(
      chatInput.querySelector('textarea')!,
      chatInput,
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes[STORAGE_KEY_API_KEY] || changes[STORAGE_KEY_MODEL])) {
        convCtrl.state.chat = undefined;
        void this.init();
      }
    });
  }

  async suggestUserPrompt(): Promise<void> {
    const { chatInput } = this.deps;
    const currentTools = this.deps.getCurrentTools();

    if (currentTools.length === 0 || !this.genAI) {
      this.userPromptPendingId++;
      chatInput.setPresets([]);
      return;
    }

    if (chatInput.value.trim().length > 0) return;

    const userPromptId = ++this.userPromptPendingId;
    const response = await this.genAI.sendMessage([
      {
        role: 'user',
        content: [
          '**Context:**',
          `Today's date is: ${this.getFormattedDate()}`,
          '**Task:** Generate exactly 3 short user prompt presets that help complete common tasks with these tools.',
          'Return ONLY a valid JSON array of strings (no markdown, no explanation).',
          'Each preset must be practical, action-oriented, and under 90 characters.',
          '**Tools:**',
          JSON.stringify(currentTools),
        ].join('\n'),
      },
    ]);

    if (userPromptId !== this.userPromptPendingId || chatInput.value.trim().length > 0) return;

    const rawContent = response.choices?.[0]?.message?.content;
    const text = typeof rawContent === 'string' ? rawContent : (rawContent ?? '').toString();
    const presets = this.extractPresetPrompts(text);
    if (presets.length === 0) return;
    this.lastSuggestedUserPrompt = presets[0];
    chatInput.setPresets(presets);
  }

  async promptAI(providedMessage?: string): Promise<void> {
    const { getCurrentTab, convCtrl, planManager, getCurrentTools, setCurrentTools, chatInput } =
      this.deps;

    const tab = await getCurrentTab();
    if (!tab?.id) return;
    convCtrl.ensureConversation();

    // Pin conversation coordinates immediately (before any async yield)
    // so that tab switches during the request don't mis-route messages.
    const pinnedConv = {
      site: convCtrl.state.currentSite,
      convId: convCtrl.state.currentConvId!,
    };
    this.pinnedConv = pinnedConv;

    let chat = convCtrl.state.chat as OpenRouterChat | undefined;
    if (!chat) {
      const result = await chrome.storage.local.get([STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL]);
      const apiKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
      const model = (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;
      chat = new OpenRouterChat(apiKey, model);
      convCtrl.state.chat = chat;
      if (pinnedConv.convId && pinnedConv.site) {
        const msgs = Store.getMessages(pinnedConv.site, pinnedConv.convId);
        for (const m of msgs) {
          if (m.role === 'user') {
            chat.history.push({ role: 'user', content: m.content });
          } else if (m.role === 'ai') {
            chat.history.push({ role: 'assistant', content: m.content });
          }
        }
      }
    }

    // Parse @mentions — use provided message or read from input
    let message = providedMessage ?? chatInput.value;
    if (!message) return;
    if (this.mentionAC) {
      const parsed = this.mentionAC.parseMentions(message);
      message = parsed.cleanText;
      this.activeMentions = parsed.mentions;
      logger.info('Mention', `Parsed ${parsed.mentions.length} mentions from prompt`, parsed.mentions.map(m => ({ title: m.title, tabId: m.tabId })));
    } else {
      this.activeMentions = [];
    }
    if (!providedMessage) chatInput.clear();
    this.lastSuggestedUserPrompt = '';

    convCtrl.addAndRender('user', message, {}, pinnedConv);

    let pageContext: PageContext | null = null;
    try {
      pageContext = (await chrome.tabs.sendMessage(tab.id, {
        action: 'GET_PAGE_CONTEXT',
      })) as PageContext;
      logger.debug('Context', `Current tab context: title="${pageContext?.title}"`, { url: tab.url });
    } catch (e) {
      logger.warn('Context', `Could not fetch page context from tab ${tab.id}`, e);
    }

    const currentTools = getCurrentTools();
    logger.info('Tools', `Current tab has ${currentTools.length} tools`, currentTools.map(t => t.name));

    // Fetch context and tools from mentioned tabs
    const mentionContexts: { tabId: number; title: string; context: PageContext }[] = [];
    let mentionedTools: CleanTool[] = [];
    for (const mention of this.activeMentions) {
      logger.info('Mention', `Processing mention: "${mention.title}" (tab ${mention.tabId})`);
      try {
        // Ensure content script is injected
        try {
          await chrome.tabs.sendMessage(mention.tabId, { action: 'PING' });
          logger.debug('Mention', `PING succeeded on tab ${mention.tabId}`);
        } catch (pingErr) {
          logger.warn('Mention', `PING failed on tab ${mention.tabId}, injecting content script`, pingErr);
          await chrome.scripting.executeScript({ target: { tabId: mention.tabId }, files: ['content.js'] });
          // Wait for content script to initialize
          await new Promise(r => setTimeout(r, 500));
          logger.info('Mention', `Content script injected on tab ${mention.tabId}`);
        }

        const ctx = await chrome.tabs.sendMessage(mention.tabId, { action: 'GET_PAGE_CONTEXT' }) as PageContext;
        logger.debug('Mention', `Context from "${mention.title}": title="${ctx?.title}"`, { pageText: ctx?.pageText?.slice(0, 200) });
        if (ctx) mentionContexts.push({ tabId: mention.tabId, title: mention.title, context: ctx });

        // Fetch tools from mentioned tab
        logger.info('Mention', `Fetching tools from "${mention.title}" (tab ${mention.tabId})...`);
        const toolsResult = await chrome.tabs.sendMessage(mention.tabId, { action: 'GET_TOOLS_SYNC' }) as { tools?: CleanTool[]; url?: string };
        logger.info('Mention', `Tab "${mention.title}" returned ${toolsResult?.tools?.length ?? 0} tools from ${toolsResult?.url}`,
          toolsResult?.tools?.map(t => ({ name: t.name, category: t.category, source: t._source })));
        if (toolsResult?.tools?.length) {
          mentionedTools = [...mentionedTools, ...toolsResult.tools];
        }
      } catch (e) {
        logger.error('Mention', `Failed to fetch from mentioned tab "${mention.title}" (${mention.tabId})`, e);
      }
    }

    // When mentions are active, use only mentioned tab tools (drop current tab tools to reduce noise).
    // The mentioned tab's tools are what the user cares about; browser tools are added by buildChatConfig.
    const allTools = mentionedTools.length > 0
      ? mentionedTools
      : currentTools;

    logger.info('Tools', `Merged: ${currentTools.length} current + ${mentionedTools.length} mentioned = ${allTools.length} total`);
    if (mentionedTools.length > 0) {
      logger.info('Tools', 'Mentioned tools:', mentionedTools.map(t => t.name));
    }

    const config = buildChatConfig(pageContext, allTools, planManager.planModeEnabled, mentionContexts);
    convCtrl.state.trace.push({ userPrompt: { message, config } });

    let screenshotDataUrl: string | undefined;
    try {
      const screenshotSettings = await chrome.storage.local.get([STORAGE_KEY_SCREENSHOT_ENABLED]);
      if (screenshotSettings[STORAGE_KEY_SCREENSHOT_ENABLED]) {
        const res = (await chrome.runtime.sendMessage({
          action: 'CAPTURE_SCREENSHOT',
        })) as ScreenshotResponse;
        if (res?.screenshot) screenshotDataUrl = res.screenshot;
      }
    } catch (e) {
      console.warn('[Sidebar] Screenshot capture failed:', e);
    }

    const userMessage: string | ContentPart[] = screenshotDataUrl
      ? [
        { type: 'text' as const, text: message },
        { type: 'image_url' as const, image_url: { url: screenshotDataUrl } },
      ]
      : message;

    chat.trimHistory();

    // Determine target tab for tool execution
    const targetTabId = this.activeMentions.length > 0 ? this.activeMentions[0].tabId : tab.id;

    // Orchestrator is the default execution path.
    // Users can opt-out by setting the storage key to `false`.
    const orchestratorSettings = await chrome.storage.local.get([STORAGE_KEY_ORCHESTRATOR_MODE]);
    const useOrchestrator = orchestratorSettings[STORAGE_KEY_ORCHESTRATOR_MODE] !== false;

    if (useOrchestrator) {
      await this.runOrchestrator(
        chat, userMessage, pageContext, allTools, mentionContexts,
        tab.id, planManager, convCtrl, setCurrentTools, pinnedConv, targetTabId,
      );
    } else {
      const initialResult = await chat.sendMessage({ message: userMessage, config });

      const loopResult = await executeToolLoop({
        chat,
        tabId: targetTabId,
        originTabId: tab.id,
        initialResult,
        pageContext,
        currentTools: allTools,
        planManager,
        trace: convCtrl.state.trace,
        addMessage: (role, content, meta) => convCtrl.addAndRender(role, content, meta, pinnedConv),
        getConfig: (ctx) => buildChatConfig(ctx, allTools, planManager.planModeEnabled, mentionContexts),
        onToolsUpdated: (tools) => { setCurrentTools(tools); },
      });

      setCurrentTools(loopResult.currentTools);
    }
    this.pinnedConv = null;
  }

  private async runOrchestrator(
    chat: OpenRouterChat,
    userMessage: string | ContentPart[],
    pageContext: PageContext | null,
    allTools: CleanTool[],
    mentionContexts: { tabId: number; title: string; context: PageContext }[],
    tabId: number,
    planManager: PlanManager,
    convCtrl: ConversationController,
    setCurrentTools: (tools: CleanTool[]) => void,
    pinnedConv: { site: string; convId: string },
    originTabId: number,
  ): Promise<void> {
    const convId = pinnedConv.convId || 'default';
    logger.info('Orchestrator', `Starting run for conv ${convId}`, { userMessage });
    let agent = this.agents[convId];

    if (!agent) {
      const settings = await chrome.storage.local.get([
        STORAGE_KEY_YOLO_MODE,
        STORAGE_KEY_ADAPTIVE_FILTERING,
      ]);
      const yoloMode = !!settings[STORAGE_KEY_YOLO_MODE];
      const adaptiveFiltering = settings[STORAGE_KEY_ADAPTIVE_FILTERING] !== false;

      const { securityDialogEl } = this.deps;
      const approvalDialogCallback = async (req: { toolName: string; args: any }) => {
        // Find tier
        const tDef = allTools.find(t => t.name === req.toolName);
        const tier = tDef ? getSecurityTier(tDef) : 1;
        const approved = await showApprovalDialog(securityDialogEl, req.toolName, tier);
        return { approved, reason: approved ? 'User approved' : 'User denied' };
      };

      const apiSettings = await chrome.storage.local.get([STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL]);
      const apiKey = String(apiSettings[STORAGE_KEY_API_KEY] || '');
      const selectedModel = String(apiSettings[STORAGE_KEY_MODEL] || DEFAULT_MODEL);
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
      const openrouter = createOpenRouter({ apiKey });

      // Aggregate atomic tools into macro-tools for reduced LLM cognitive load
      const macroTools = aggregate(allTools as CleanTool[], adaptiveFiltering);
      const macroToolSet = createMacroToolSet(macroTools, { tabId, originTabId });
      logger.info('Orchestrator', `Macro-tools (adaptive=${adaptiveFiltering}): ${macroTools.map(m => `${m.name}(${m.subActions.length})`).join(', ')}`);

      // Log tool names for debugging
      const toolNames = Object.keys(macroToolSet);
      logger.info('Orchestrator', `Tool set keys: ${toolNames.join(', ')}`);
      for (const name of toolNames) {
        const t = macroToolSet[name];
        logger.debug('Orchestrator', `Tool "${name}": desc=${t?.description?.slice(0, 60)}, hasParams=${!!t?.parameters}, hasExecute=${typeof t?.execute === 'function'}`);
      }

      // DeepAgent external library has loose type contracts — typed locally where possible
      interface ApprovalRequest { toolName: string; args: Record<string, unknown> }

      agent = DeepAgent.create({
        name: 'GaussFlow Agent',
        model: openrouter(selectedModel),
        instructions: buildChatConfig(pageContext, allTools as CleanTool[], planManager.planModeEnabled, mentionContexts).systemInstruction?.join('\n') || '',
        maxSteps: 15,
        subagent: {},
        approval: {
          defaultMode: yoloMode ? 'approve-all' : 'deny-all',
          autoApprove: ['ls', 'read_file'],
          requireApproval: ['execute_script', 'create_file', 'edit_file', 'delete_file'],
          onApprovalRequired: async (req: ApprovalRequest) => {
            const res = await approvalDialogCallback(req);
            return String(res.approved) === 'yes';
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DeepAgent approval config type mismatch
        } as Parameters<typeof DeepAgent.create>[0]['approval'],
      })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DeepAgent expects its own Tool type
        .withTools(macroToolSet as Parameters<ReturnType<typeof DeepAgent.create>['withTools']>[0])
        .withPlanning()
        .build();

      // Error events from the event bus are still useful for non-stream errors
      agent.eventBus.on('*', (event: AgentEvent<unknown>) => {
        logger.debug('Orchestrator', `Agent event: ${event.type}`);
        if (!this.pinnedConv) return;
        if (event.type === 'error') {
          const errData = event.data as { error?: Error };
          convCtrl.addAndRender('tool_error', errData?.error?.message || 'Error occurred', { tool: 'Agent' }, this.pinnedConv!);
        }
      });

      this.agents[convId] = agent;
    }

    const sessionId = pinnedConv.convId || Date.now().toString();

    try {
      const prompt = typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage);
      const streamResult = await agent.stream(
        { messages: [{ role: 'user', content: prompt }] },
      );

      // streamResult comes from AI SDK's streamText() — provides textStream, fullStream, callbacks
      // Consume fullStream for real-time tool call/result/text rendering
      let accumulatedText = '';
      const reader = (streamResult.fullStream as ReadableStream).getReader();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const part = value as { type: string; toolCallId?: string; toolName?: string; args?: Record<string, unknown>; result?: unknown; textDelta?: string };

        switch (part.type) {
          case 'tool-call':
            convCtrl.addAndRender('tool_call', '', { tool: part.toolName, args: part.args }, pinnedConv);
            break;
          case 'tool-result':
            {
              const content = typeof part.result === 'string' ? part.result : (JSON.stringify(part.result) ?? '');
              convCtrl.addAndRender('tool_result', content.slice(0, 500), { tool: part.toolName }, pinnedConv);
            }
            break;
          case 'text-delta':
            if (part.textDelta) accumulatedText += part.textDelta;
            break;
        }
      }

      logger.info('Orchestrator', 'Stream completed', { textLen: accumulatedText.length, text: accumulatedText.slice(0, 200) });

      if (accumulatedText.trim().length > 0) {
        convCtrl.addAndRender('ai', accumulatedText, {}, pinnedConv);
      } else {
        logger.info('Orchestrator', 'Stream completed with no text output (tool-only run)');
      }
    } catch (err: any) {
      const errDetail = err?.cause ? `${err.message} [cause: ${err.cause?.message || JSON.stringify(err.cause)}]` : err.message;
      logger.error('Orchestrator', `Agent run failed: ${errDetail}`, { stack: err.stack, cause: err.cause, responseBody: err.responseBody });
      convCtrl.addAndRender('error', `Agent crashed: ${errDetail}`, {}, pinnedConv);
    }

    setCurrentTools(allTools); // We don't have dynamic 'updatedTools' from run directly usually unless returned by tools
    planManager.markRemainingStepsDone();
  }

  private getFormattedDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private extractPresetPrompts(text: string): string[] {
    const normalized = text.trim();

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => String(item).trim())
          .filter(item => item.length > 0)
          .slice(0, 3);
      }
    } catch {
      // fallback parser below
    }

    return normalized
      .split('\n')
      .map(line => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 3);
  }
}
