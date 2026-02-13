/**
 * ChromeContextAdapter — IContextPort implementation for Chrome Extension.
 *
 * Bridges page context (via chrome.tabs.sendMessage), conversation history
 * (via chat-store), and live state (embedded in PageContext) into the
 * hexagonal port contract.
 */

import type { IContextPort } from '../ports/context.port';
import type { ContextSummary, LiveStateSnapshot, Message, PageContext } from '../ports/types';
import { getMessages } from '../sidebar/chat-store';
import { logger } from '../sidebar/debug-logger';

/** Ensure the content script is loaded in the target tab */
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PING' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  }
}

/** Rough token count: ~4 chars per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ChromeContextAdapterConfig {
  /** Current site key for chat-store lookups */
  readonly site: string;
  /** Current conversation ID */
  readonly conversationId: string;
}

export class ChromeContextAdapter implements IContextPort {
  private lastPageContext: PageContext | null = null;
  private config: ChromeContextAdapterConfig;

  constructor(config: ChromeContextAdapterConfig) {
    this.config = config;
  }

  /** Update the active site/conversation coordinates */
  setConfig(config: ChromeContextAdapterConfig): void {
    this.config = config;
  }

  async getPageContext(tabId: number): Promise<PageContext | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await ensureContentScript(tabId);
        const ctx = await chrome.tabs.sendMessage(tabId, {
          action: 'GET_PAGE_CONTEXT',
        }) as PageContext;
        this.lastPageContext = ctx;
        return ctx;
      } catch (e) {
        logger.warn(
          'ChromeContextAdapter',
          `getPageContext attempt ${attempt + 1}/3 failed for tab ${tabId}`,
          e,
        );
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return this.lastPageContext;
  }

  getLiveState(): LiveStateSnapshot | null {
    return this.lastPageContext?.liveState ?? null;
  }

  getConversationHistory(): readonly Message[] {
    const { site, conversationId } = this.config;
    return getMessages(site, conversationId);
  }

  async summarizeIfNeeded(
    messages: readonly Message[],
    tokenBudget: number,
  ): Promise<ContextSummary> {
    const totalTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );

    if (totalTokens <= tokenBudget) {
      return {
        originalCount: messages.length,
        compressedCount: messages.length,
        summary: '',
      };
    }

    // Simple tail-window: keep the most recent messages within budget
    let kept = 0;
    let budget = tokenBudget;
    for (let i = messages.length - 1; i >= 0; i--) {
      const cost = estimateTokens(messages[i].content);
      if (cost > budget) break;
      budget -= cost;
      kept++;
    }

    const droppedCount = messages.length - kept;
    const summary = `[${droppedCount} earlier message${droppedCount === 1 ? '' : 's'} summarized to fit context window]`;

    return {
      originalCount: messages.length,
      compressedCount: kept,
      summary,
    };
  }
}
