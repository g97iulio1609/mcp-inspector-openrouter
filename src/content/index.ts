/**
 * Content script entry — main orchestrator.
 *
 * 3-tier tool discovery (native, declarative, inferred), merge,
 * schema enrichment, DOM observation, SPA navigation interception,
 * and message handling.
 */

import type {
  Tool,
  CleanTool,
  ToolInputSchema,
  SchemaProperty,
  ContentScriptMessage,
  PageContext,
  PageLink,
  ProductInfo,
} from '../types';
import {
  DOM_OBSERVER_DEBOUNCE_MS,
  SPA_NAVIGATION_DEBOUNCE_MS,
  MAX_PAGE_CONTEXT_PRODUCTS,
  SECURITY_TIERS,
  STORAGE_KEY_YOLO_MODE,
} from '../utils/constants';
import { getFormValues } from '../utils/dom';
import { ScannerRegistry } from './scanners';
import { ExecutorRegistry } from './executors';
import { mergeToolSets, getSecurityTier } from './merge';
import { AIClassifier } from './ai-classifier';

// ── Guard against duplicate injection ──
if (window.__wmcp_loaded) {
  console.debug('[WebMCP] Content script already loaded, skipping');
} else {
  window.__wmcp_loaded = true;
  console.debug('[WebMCP] Content script injected');

  // ── Registries & state ──
  const scannerRegistry = new ScannerRegistry();
  const executorRegistry = new ExecutorRegistry();
  const aiClassifier = new AIClassifier();
  const inferredToolsMap = new Map<string, Tool>();

  let domObserver: MutationObserver | null = null;
  let domObserverDebounce: ReturnType<typeof setTimeout> | null = null;

  // Pending confirmation queue: toolName → { resolve, reject, tool, args }
  const pendingConfirmations = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      tool: Tool;
      args: Record<string, unknown>;
    }
  >();

  // ── YOLO mode (cached, updated on storage change) ──
  let yoloMode = true; // Default: YOLO on
  chrome.storage.local.get([STORAGE_KEY_YOLO_MODE]).then((r) => {
    yoloMode = r[STORAGE_KEY_YOLO_MODE] !== false;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (STORAGE_KEY_YOLO_MODE in changes) {
      yoloMode = changes[STORAGE_KEY_YOLO_MODE].newValue !== false;
    }
  });

  // ── Message handler helpers ──

  function handlePing(reply: (r?: unknown) => void): boolean {
    reply({ status: 'pong' });
    return false;
  }

  function handleSetLockMode(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const locked = (msg as { inputArgs?: { locked?: boolean } }).inputArgs?.locked ?? true;
    if (locked) {
      stopDomObserver();
      console.debug('[WebMCP] DOM observer STOPPED (locked)');
    } else {
      startDomObserver();
      console.debug('[WebMCP] DOM observer STARTED (live mode)');
    }
    reply({ locked });
    return false;
  }

  function handleGetPageContext(reply: (r?: unknown) => void): boolean {
    reply(extractPageContext());
    return false;
  }

  function handleListTools(reply: (r?: unknown) => void): boolean {
    listToolsAlwaysAugment();
    if (navigator.modelContextTesting?.registerToolsChangedCallback) {
      navigator.modelContextTesting.registerToolsChangedCallback(
        () => listToolsAlwaysAugment(),
      );
    }
    reply({ queued: true });
    return false;
  }

  function handleExecuteTool(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const execMsg = msg as { name: string; inputArgs: string | Record<string, unknown> };
    const toolName = execMsg.name;
    const inputArgs = execMsg.inputArgs;

    // Check inferred tools first
    const inferredTool = inferredToolsMap.get(toolName);
    if (inferredTool) {
      console.debug(
        `[WebMCP] Execute INFERRED tool "${toolName}" with`,
        inputArgs,
      );
      const parsedArgs: Record<string, unknown> =
        typeof inputArgs === 'string'
          ? JSON.parse(inputArgs)
          : inputArgs;

      const tier = getSecurityTier(inferredTool);
      const tierInfo = SECURITY_TIERS[tier];

      if (!tierInfo.autoExecute && !yoloMode) {
        const promise = new Promise<unknown>((resolve, reject) => {
          pendingConfirmations.set(toolName, {
            resolve,
            reject,
            tool: inferredTool,
            args: parsedArgs,
          });
        });

        chrome.runtime.sendMessage({
          action: 'CONFIRM_EXECUTION',
          toolName,
          description: inferredTool.description,
          tier,
        });

        promise
          .then((result) => reply(result))
          .catch((err: Error) => reply(JSON.stringify(err.message)));
        return true;
      }

      executorRegistry
        .execute(inferredTool, parsedArgs)
        .then((result) => reply(result))
        .catch((err: Error) => {
          console.error('[WebMCP] Inferred execution error:', err);
          reply(JSON.stringify(err.message || String(err)));
        });
      return true;
    }

    // Native/declarative tool execution
    if (!navigator.modelContextTesting) {
      reply(
        JSON.stringify(
          'WebMCP native API not available for native tool execution',
        ),
      );
      return false;
    }

    // Validate tool exists in native API before executing
    try {
      const nativeTools = navigator.modelContextTesting.listTools() || [];
      const exists = (nativeTools as Tool[]).some((t) => t.name === toolName);
      if (!exists) {
        reply(JSON.stringify(`Tool "${toolName}" not found`));
        return false;
      }
    } catch { /* proceed anyway if listTools fails */ }

    const normalizedArgs = normalizeToolArgs(toolName, inputArgs);
    console.debug(
      `[WebMCP] Execute NATIVE tool "${toolName}" with`,
      normalizedArgs,
    );

    let targetFrame: HTMLIFrameElement | null = null;
    let loadPromise: Promise<void> | undefined;

    const formTarget = document.querySelector(
      `form[toolname="${toolName}"]`,
    )?.getAttribute('target');
    if (formTarget) {
      targetFrame = document.querySelector(
        `[name="${formTarget}"]`,
      ) as HTMLIFrameElement | null;
      if (targetFrame) {
        loadPromise = new Promise<void>((resolve) => {
          targetFrame!.addEventListener('load', () => resolve(), {
            once: true,
          });
        });
      }
    }

    navigator.modelContextTesting
      .executeTool(toolName, normalizedArgs)
      .then(async (result: unknown) => {
        let finalResult = result;
        if (
          finalResult === null &&
          targetFrame &&
          loadPromise
        ) {
          console.debug(
            `[WebMCP] Waiting for form target to load`,
          );
          await loadPromise;
          finalResult =
            await (targetFrame as HTMLIFrameElement).contentWindow
              ?.navigator?.modelContextTesting
              ?.getCrossDocumentScriptToolResult();
        }
        reply(finalResult);
      })
      .catch((err: Error) => {
        console.error('[WebMCP] Execution error:', err);
        reply(JSON.stringify(err.message || String(err)));
      });
    return true;
  }

  function handleGetCrossDocumentResult(reply: (r?: unknown) => void): boolean {
    if (!navigator.modelContextTesting) {
      reply(JSON.stringify('WebMCP native API not available'));
      return false;
    }
    console.debug('[WebMCP] Get cross document script tool result');
    navigator.modelContextTesting
      .getCrossDocumentScriptToolResult()
      .then(reply)
      .catch((err: Error) => reply(JSON.stringify(err.message)));
    return true;
  }

  function handleConfirmExecute(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const pending = pendingConfirmations.get((msg as { toolName: string }).toolName);
    if (pending) {
      pendingConfirmations.delete((msg as { toolName: string }).toolName);
      executorRegistry
        .execute(pending.tool, pending.args)
        .then((result) => pending.resolve(result))
        .catch((err: Error) => pending.reject(err));
    }
    reply({ confirmed: true });
    return false;
  }

  function handleCancelExecute(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const cancelled = pendingConfirmations.get((msg as { toolName: string }).toolName);
    if (cancelled) {
      pendingConfirmations.delete((msg as { toolName: string }).toolName);
      cancelled.reject(new Error('Execution cancelled by user'));
    }
    reply({ cancelled: true });
    return false;
  }

  // ── Message handler ──
  chrome.runtime.onMessage.addListener(
    (
      msg: ContentScriptMessage,
      _sender: chrome.runtime.MessageSender,
      reply: (response?: unknown) => void,
    ) => {
      try {
        switch (msg.action) {
          case 'PING':
            return handlePing(reply);
          case 'SET_LOCK_MODE':
            return handleSetLockMode(msg, reply);
          case 'GET_PAGE_CONTEXT':
            return handleGetPageContext(reply);
          case 'LIST_TOOLS':
            return handleListTools(reply);
          case 'EXECUTE_TOOL':
            return handleExecuteTool(msg, reply);
          case 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT':
            return handleGetCrossDocumentResult(reply);
          case 'CONFIRM_EXECUTE':
            return handleConfirmExecute(msg, reply);
          case 'CANCEL_EXECUTE':
            return handleCancelExecute(msg, reply);
          case 'CAPTURE_SCREENSHOT':
            return false;
          default:
            return false;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        chrome.runtime.sendMessage({ message });
        return false;
      }
    },
  );

  // ── Tool argument normalisation ──

  function normalizeToolArgs(
    toolName: string,
    inputArgs: string | Record<string, unknown>,
  ): string {
    try {
      const args: Record<string, unknown> =
        typeof inputArgs === 'string' ? JSON.parse(inputArgs) : inputArgs;
      const form = document.querySelector(
        `form[toolname="${toolName}"]`,
      ) as HTMLFormElement | null;
      if (!form)
        return typeof inputArgs === 'string'
          ? inputArgs
          : JSON.stringify(inputArgs);

      const normalized = { ...args };

      for (const [key, value] of Object.entries(normalized)) {
        if (typeof value !== 'string') continue;

        const select = form.querySelector(
          `select[name="${key}"]`,
        ) as HTMLSelectElement | null;
        if (select) {
          const match = [...select.options].find(
            (opt) => opt.value.toLowerCase() === value.toLowerCase(),
          );
          if (match) {
            normalized[key] = match.value;
            continue;
          }
        }

        const radios = form.querySelectorAll(
          `input[type="radio"][name="${key}"]`,
        ) as NodeListOf<HTMLInputElement>;
        if (radios.length > 0) {
          const match = [...radios].find(
            (r) => r.value.toLowerCase() === value.toLowerCase(),
          );
          if (match) {
            normalized[key] = match.value;
            continue;
          }
        }
      }

      return JSON.stringify(normalized);
    } catch (e) {
      console.warn('[WebMCP] Normalization failed, using original args:', e);
      return typeof inputArgs === 'string'
        ? inputArgs
        : JSON.stringify(inputArgs);
    }
  }

  // ── Page context extraction ──

  function extractPageContext(): PageContext {
    let products: ProductInfo[] | undefined;
    let cartCount: number | undefined;
    let formDefaults: Record<string, Record<string, string>> | undefined;
    let mainHeading: string | undefined;
    let pageText: string | undefined;
    let headings: string[] | undefined;
    let links: PageLink[] | undefined;
    let metaDescription: string | undefined;

    // Products via Schema.org microdata or data-mcp-type
    const productEls = document.querySelectorAll(
      '[data-mcp-type="product"], [itemtype*="schema.org/Product"]',
    );
    if (productEls.length) {
      products = [...productEls]
        .slice(0, MAX_PAGE_CONTEXT_PRODUCTS)
        .map((el) => {
          const name = el
            .querySelector('[itemprop="name"], .product-name')
            ?.textContent?.trim();
          const price = el
            .querySelector('[itemprop="price"], .product-price')
            ?.textContent?.trim();
          const id =
            (el as HTMLElement).dataset?.productId ||
            el.id ||
            null;
          return { id, name, price };
        });
    }

    // Cart state
    const cartBadge = document.querySelector(
      '#cart-count, [data-cart-count], .cart-count, .cart-badge',
    );
    if (cartBadge) {
      cartCount = parseInt(cartBadge.textContent ?? '0', 10) || 0;
    }

    // Current form values for each tool form
    const forms = document.querySelectorAll('form[toolname]');
    if (forms.length) {
      formDefaults = {};
      forms.forEach((f) => {
        const toolName = f.getAttribute('toolname');
        if (toolName) {
          formDefaults![toolName] = getFormValues(f as HTMLFormElement);
        }
      });
    }

    // Key heading
    const h1 = document.querySelector('h1');
    if (h1) mainHeading = h1.textContent?.trim();

    // Full visible page text via TreeWalker (avoids layout-triggering innerText)
    try {
      const MAX_TEXT_NODES = 5000;
      const MAX_TEXT_LEN = 8000;
      const chunks: string[] = [];
      let totalLen = 0;
      let nodeCount = 0;

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node: Node): number {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT')
              return NodeFilter.FILTER_REJECT;
            // Skip hidden elements (offsetParent is null for display:none, except for body/fixed)
            if (!parent.offsetParent && parent !== document.body && getComputedStyle(parent).position !== 'fixed')
              return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      let textNode: Node | null;
      while ((textNode = walker.nextNode())) {
        if (nodeCount++ >= MAX_TEXT_NODES) break;
        const t = textNode.textContent?.trim();
        if (!t) continue;
        chunks.push(t);
        totalLen += t.length;
        if (totalLen >= MAX_TEXT_LEN) break;
      }

      const rawText = chunks.join(' ');
      if (rawText) {
        pageText = rawText.length <= MAX_TEXT_LEN
          ? rawText
          : rawText.slice(0, MAX_TEXT_LEN) + ' […truncated]';
      }
    } catch { /* ignore */ }

    // All h1-h3 headings
    const headingEls = document.querySelectorAll('h1, h2, h3');
    if (headingEls.length) {
      headings = [...headingEls]
        .map((el) => el.textContent?.trim() ?? '')
        .filter(Boolean);
    }

    // Meta description
    const metaEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (metaEl?.content) {
      metaDescription = metaEl.content;
    }

    // Top 30 links from nav/main areas
    const linkEls = document.querySelectorAll('nav a[href], main a[href], header a[href], [role="navigation"] a[href]');
    const allLinks = linkEls.length > 0 ? linkEls : document.querySelectorAll('a[href]');
    if (allLinks.length) {
      const seen = new Set<string>();
      links = [];
      for (const a of allLinks) {
        if (links.length >= 30) break;
        const anchor = a as HTMLAnchorElement;
        const text = anchor.textContent?.trim();
        const href = anchor.href;
        if (text && href && !seen.has(href)) {
          seen.add(href);
          links.push({ text, href });
        }
      }
    }

    const ctx: PageContext = {
      url: location.href,
      title: document.title,
      ...(products ? { products } : {}),
      ...(cartCount !== undefined ? { cartCount } : {}),
      ...(formDefaults ? { formDefaults } : {}),
      ...(mainHeading ? { mainHeading } : {}),
      ...(pageText ? { pageText } : {}),
      ...(headings?.length ? { headings } : {}),
      ...(links?.length ? { links } : {}),
      ...(metaDescription ? { metaDescription } : {}),
    };

    console.debug('[WebMCP] Page context extracted:', ctx);
    return ctx;
  }

  // ── Schema enrichment ──

  function enrichToolSchemas(tools: Tool[]): Tool[] {
    return tools.map((tool) => {
      const form = document.querySelector(
        `form[toolname="${tool.name}"]`,
      ) as HTMLFormElement | null;
      if (!form || !tool.inputSchema) return tool;

      let schema: ToolInputSchema;
      try {
        schema =
          typeof tool.inputSchema === 'string'
            ? JSON.parse(tool.inputSchema)
            : tool.inputSchema;
      } catch {
        return tool;
      }
      if (!schema.properties) return tool;

      const mutableProps = {
        ...schema.properties,
      } as Record<string, SchemaProperty>;

      for (const [propName, propDef] of Object.entries(mutableProps)) {
        const select = form.querySelector(
          `select[name="${propName}"]`,
        ) as HTMLSelectElement | null;
        if (select) {
          const vals = [...select.options]
            .map((o) => o.value)
            .filter(Boolean);
          if (vals.length) {
            mutableProps[propName] = { ...propDef, enum: vals };
          }
          continue;
        }
        const radios = form.querySelectorAll(
          `input[type="radio"][name="${propName}"]`,
        ) as NodeListOf<HTMLInputElement>;
        if (radios.length) {
          const vals = [...radios].map((r) => r.value).filter(Boolean);
          mutableProps[propName] = { ...propDef, enum: vals };
        }
      }

      const enrichedSchema: ToolInputSchema = {
        ...schema,
        properties: mutableProps,
      };

      return {
        ...tool,
        inputSchema: JSON.stringify(enrichedSchema),
      };
    });
  }

  // ── Declarative form schema extraction ──

  function extractFormSchema(form: HTMLFormElement): string {
    const props: Record<string, SchemaProperty> = {};
    const required: string[] = [];

    for (const inp of form.querySelectorAll(
      'input, select, textarea',
    ) as NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
      if (
        (inp as HTMLInputElement).type === 'hidden' ||
        (inp as HTMLInputElement).type === 'submit'
      )
        continue;
      const name = inp.name || inp.id;
      if (!name) continue;

      const prop: SchemaProperty = {
        type: (inp as HTMLInputElement).type === 'number' ? 'number' : 'string',
      };
      if (inp.tagName === 'SELECT') {
        const selectEl = inp as HTMLSelectElement;
        const enumVals = [...selectEl.options]
          .map((o) => o.value)
          .filter(Boolean);
        if (enumVals.length) {
          props[name] = { ...prop, enum: enumVals };
        } else {
          props[name] = prop;
        }
      } else {
        props[name] = prop;
      }

      if (inp.required) required.push(name);
    }

    return JSON.stringify({
      type: 'object',
      properties: props,
      ...(required.length ? { required } : {}),
    });
  }

  // ── Scanner result cache ──
  const SCANNER_CACHE_TTL_MS = 2000;
  let scannerCacheTime = 0;
  let scannerCacheResult: Tool[] | null = null;

  // ── 3-tier tool discovery (always-augment model) ──

  async function listToolsAlwaysAugment(): Promise<void> {
    let nativeTools: Tool[] = [];
    let declarativeTools: Tool[] = [];
    let inferredTools: Tool[] = [];

    // Tier 1: WMCP Native API
    if (navigator.modelContextTesting) {
      try {
        const raw = navigator.modelContextTesting.listTools() || [];
        nativeTools = enrichToolSchemas(raw as Tool[]);
      } catch (e) {
        console.warn('[WebMCP] Native API failed:', e);
      }
    }

    // Tier 2: Declarative HTML (form[toolname])
    const declForms = document.querySelectorAll('form[toolname]');
    if (declForms.length > 0) {
      declarativeTools = [...declForms].map((f) => {
        const form = f as HTMLFormElement;
        return {
          name: form.getAttribute('toolname') ?? '',
          description: form.getAttribute('tooldescription') ?? '',
          inputSchema: extractFormSchema(form),
        } as Tool;
      });
      declarativeTools = enrichToolSchemas(declarativeTools);
    }

    // Tier 3: Auto-Inference — use cache if fresh
    const now = Date.now();
    if (scannerCacheResult && (now - scannerCacheTime) < SCANNER_CACHE_TTL_MS) {
      inferredTools = scannerCacheResult;
      console.debug('[WebMCP] Using cached scanner results');
    } else {
      try {
        const scanStart = performance.now();
        inferredTools = scannerRegistry.scanAll();
        const scanMs = (performance.now() - scanStart).toFixed(1);
        console.debug(`[WebMCP] Scanner scan completed in ${scanMs}ms (${inferredTools.length} tools)`);
        scannerCacheResult = inferredTools;
        scannerCacheTime = now;
      } catch (e) {
        console.warn('[WebMCP] Inference scan failed:', e);
      }
    }

    // Store inferred tools for execution routing
    inferredToolsMap.clear();
    for (const t of inferredTools) {
      inferredToolsMap.set(t.name, t);
    }

    // Union merge (native wins on name collision)
    let tools = mergeToolSets(nativeTools, declarativeTools, inferredTools);

    // Post-merge cleanup: deduplicate by name (keep highest confidence),
    // filter out low-confidence tools, sort by category
    const dedupMap = new Map<string, Tool>();
    for (const tool of tools) {
      const existing = dedupMap.get(tool.name);
      if (!existing || (tool.confidence ?? 0) > (existing.confidence ?? 0)) {
        dedupMap.set(tool.name, tool);
      }
    }
    tools = [...dedupMap.values()]
      .filter((t) => (t.confidence ?? 1) >= 0.3)
      .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''));

    // Strip internal properties before sending to sidebar
    const cleanTools: CleanTool[] = tools.map(
      ({ _el, _form, _schemaAction, ...rest }) => rest,
    );

    const sources = {
      native: cleanTools.filter((t) => t._source === 'native').length,
      declarative: cleanTools.filter((t) => t._source === 'declarative')
        .length,
      inferred: cleanTools.filter((t) => t._source === 'inferred').length,
    };
    console.debug(
      `[WebMCP] ${cleanTools.length} tools (${sources.native}N + ${sources.declarative}D + ${sources.inferred}I)`,
      cleanTools,
    );

    chrome.runtime.sendMessage({ tools: cleanTools, url: location.href });
  }

  // ── DOM Mutation Observer ──

  function startDomObserver(): void {
    if (domObserver) return;

    domObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => {
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (
              el.matches?.('form[toolname]') ||
              el.querySelector?.('form[toolname]')
            )
              return true;
            if (
              el.matches?.('[contenteditable="true"]') ||
              el.querySelector?.('[contenteditable="true"]')
            )
              return true;
            if (
              el.matches?.('[role="textbox"]') ||
              el.querySelector?.('[role="textbox"]')
            )
              return true;
            if (
              el.matches?.('input[type="file"]') ||
              el.querySelector?.('input[type="file"]')
            )
              return true;
            if (
              el.matches?.(
                '[aria-label*="like" i], [aria-label*="share" i], [aria-label*="follow" i]',
              )
            )
              return true;
          }
        }
        if (
          m.type === 'attributes' &&
          (m.target as Element).closest?.('form[toolname]')
        )
          return true;
        if (
          m.type === 'attributes' &&
          (m.attributeName === 'contenteditable' ||
            m.attributeName === 'role')
        )
          return true;
        if (
          m.type === 'characterData' &&
          (m.target as Node).parentElement?.closest?.('form[toolname]')
        )
          return true;
        return false;
      });

      if (relevant) {
        if (domObserverDebounce) clearTimeout(domObserverDebounce);
        domObserverDebounce = setTimeout(() => {
          console.debug('[WebMCP] DOM change detected, refreshing tools...');
          listToolsAlwaysAugment();
        }, DOM_OBSERVER_DEBOUNCE_MS);
      }
    });

    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: [
        'toolname',
        'tooldescription',
        'name',
        'value',
        'type',
      ],
    });
    console.debug('[WebMCP] DOM observer initialized');
  }

  function stopDomObserver(): void {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    if (domObserverDebounce) clearTimeout(domObserverDebounce);
  }

  // ── SPA Navigation Interception ──

  let lastSpaUrl = location.href;
  let spaDebounce: ReturnType<typeof setTimeout> | null = null;

  function onSpaNavigation(): void {
    if (location.href === lastSpaUrl) return;
    lastSpaUrl = location.href;
    // Invalidate scanner cache on navigation
    scannerCacheResult = null;
    if (spaDebounce) clearTimeout(spaDebounce);
    spaDebounce = setTimeout(() => {
      console.debug('[WebMCP] SPA navigation detected →', location.href);
      listToolsAlwaysAugment();
    }, SPA_NAVIGATION_DEBOUNCE_MS);
  }

  // Safely patch pushState/replaceState — guard against pages that override these
  try {
    const origPushState = history.pushState.bind(history);
    history.pushState = function (...args: Parameters<typeof history.pushState>): void {
      origPushState(...args);
      onSpaNavigation();
    };

    const origReplaceState = history.replaceState.bind(history);
    history.replaceState = function (
      ...args: Parameters<typeof history.replaceState>
    ): void {
      origReplaceState(...args);
      onSpaNavigation();
    };
  } catch (e) {
    console.warn('[WebMCP] Could not patch history API:', e);
  }

  window.addEventListener('popstate', onSpaNavigation);

  // ── Custom events from the page ──
  window.addEventListener('toolactivated', ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.debug(
      `[WebMCP] Tool "${detail?.toolName ?? ''}" started execution.`,
    );
  }) as EventListener);

  window.addEventListener('toolcancel', ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.debug(
      `[WebMCP] Tool "${detail?.toolName ?? ''}" execution is cancelled.`,
    );
  }) as EventListener);

  // Export AI classifier for external usage (e.g. inference engine)
  void aiClassifier;
}
