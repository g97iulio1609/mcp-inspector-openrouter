/**
 * AdaptiveWait — intelligent page load detection for tab operations.
 * Replaces hardcoded timeouts with event-driven detection.
 */

export interface AdaptiveWaitOptions {
  /** Maximum time to wait in ms (default: 10000) */
  readonly maxWaitMs: number;
  /** Minimum time to wait after tab status='complete' for SPA settling (default: 200) */
  readonly settleMs: number;
}

const DEFAULT_OPTIONS: AdaptiveWaitOptions = {
  maxWaitMs: 10_000,
  settleMs: 200,
};

/**
 * Wait for a Chrome tab to finish loading using chrome.tabs.onUpdated.
 * Returns the elapsed time in ms.
 *
 * Strategy:
 * 1. Listen for tab status='complete' event
 * 2. After complete, wait an additional settleMs for SPA hydration
 * 3. If maxWaitMs exceeded, resolve anyway (never hang)
 */
export async function waitForTabReady(
  tabId: number,
  options?: Partial<AdaptiveWaitOptions>,
): Promise<number> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const start = performance.now();

  await new Promise<void>((resolve) => {
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const done = (): void => {
      if (!settled) {
        settled = true;
        if (settleTimer !== null) clearTimeout(settleTimer);
        if (safetyTimer !== null) clearTimeout(safetyTimer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
    ): void => {
      if (settled) return;
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        // Cancel any prior settle timer from repeated events
        if (settleTimer !== null) clearTimeout(settleTimer);
        settleTimer = setTimeout(done, opts.settleMs);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    safetyTimer = setTimeout(done, opts.maxWaitMs);
  });

  return performance.now() - start;
}

/**
 * Wait for a tab to be focused and ready after activation.
 * Replaces the hardcoded 300ms pause.
 *
 * Strategy:
 * 1. Check if tab is already active
 * 2. If not, listen for chrome.tabs.onActivated
 * 3. Then wait settleMs for rendering
 */
export async function waitForTabFocus(
  tabId: number,
  options?: Partial<AdaptiveWaitOptions>,
): Promise<number> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const start = performance.now();

  // Check if tab is already active
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.active) {
      await delay(opts.settleMs);
      return performance.now() - start;
    }
  } catch {
    // Tab might not exist — fall through to timeout
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const done = (): void => {
      if (!settled) {
        settled = true;
        if (settleTimer !== null) clearTimeout(settleTimer);
        if (safetyTimer !== null) clearTimeout(safetyTimer);
        chrome.tabs.onActivated.removeListener(listener);
        resolve();
      }
    };

    const listener = (info: chrome.tabs.OnActivatedInfo): void => {
      if (settled) return;
      if (info.tabId === tabId) {
        if (settleTimer !== null) clearTimeout(settleTimer);
        settleTimer = setTimeout(done, opts.settleMs);
      }
    };

    chrome.tabs.onActivated.addListener(listener);
    safetyTimer = setTimeout(done, opts.maxWaitMs);
  });

  return performance.now() - start;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
