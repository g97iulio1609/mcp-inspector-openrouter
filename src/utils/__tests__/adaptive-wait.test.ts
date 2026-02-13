import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForTabReady, waitForTabFocus } from '../adaptive-wait';

// ── Chrome API mocks ──

const mockListeners: {
  onUpdated: Array<(tabId: number, changeInfo: { status?: string }) => void>;
  onActivated: Array<(info: { tabId: number }) => void>;
} = { onUpdated: [], onActivated: [] };

(globalThis as any).chrome = {
  tabs: {
    onUpdated: {
      addListener: (fn: any) => mockListeners.onUpdated.push(fn),
      removeListener: (fn: any) => {
        const idx = mockListeners.onUpdated.indexOf(fn);
        if (idx >= 0) mockListeners.onUpdated.splice(idx, 1);
      },
    },
    onActivated: {
      addListener: (fn: any) => mockListeners.onActivated.push(fn),
      removeListener: (fn: any) => {
        const idx = mockListeners.onActivated.indexOf(fn);
        if (idx >= 0) mockListeners.onActivated.splice(idx, 1);
      },
    },
    get: vi.fn(),
  },
};

describe('waitForTabReady', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockListeners.onUpdated = [];
    mockListeners.onActivated = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when tab status becomes complete', async () => {
    const promise = waitForTabReady(1, { maxWaitMs: 5000, settleMs: 50 });

    // Simulate tab completing
    mockListeners.onUpdated.forEach((fn) => fn(1, { status: 'complete' }));
    await vi.advanceTimersByTimeAsync(50);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(mockListeners.onUpdated).toHaveLength(0); // listener removed
  });

  it('resolves on timeout if tab never completes', async () => {
    const promise = waitForTabReady(1, { maxWaitMs: 500, settleMs: 50 });

    await vi.advanceTimersByTimeAsync(500);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(mockListeners.onUpdated).toHaveLength(0);
  });

  it('ignores events from other tabs', async () => {
    const promise = waitForTabReady(1, { maxWaitMs: 1000, settleMs: 50 });

    // Event from a different tab — should not resolve
    mockListeners.onUpdated.forEach((fn) => fn(999, { status: 'complete' }));
    await vi.advanceTimersByTimeAsync(100);

    // Listener should still be registered
    expect(mockListeners.onUpdated).toHaveLength(1);

    // Now send correct tab event
    mockListeners.onUpdated.forEach((fn) => fn(1, { status: 'complete' }));
    await vi.advanceTimersByTimeAsync(50);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(mockListeners.onUpdated).toHaveLength(0);
  });

  it('uses default options when none provided', async () => {
    const promise = waitForTabReady(1);

    // Simulate tab completing
    mockListeners.onUpdated.forEach((fn) => fn(1, { status: 'complete' }));
    // Default settleMs is 200
    await vi.advanceTimersByTimeAsync(200);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe('waitForTabFocus', () => {
  const mockGet = (globalThis as any).chrome.tabs.get as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockListeners.onUpdated = [];
    mockListeners.onActivated = [];
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately if tab is already active', async () => {
    mockGet.mockResolvedValue({ active: true });

    const promise = waitForTabFocus(1, { maxWaitMs: 5000, settleMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    // No onActivated listener should have been added
    expect(mockListeners.onActivated).toHaveLength(0);
  });

  it('resolves when tab is activated', async () => {
    mockGet.mockResolvedValue({ active: false });

    const promise = waitForTabFocus(1, { maxWaitMs: 5000, settleMs: 50 });
    // Let the async chrome.tabs.get resolve
    await vi.advanceTimersByTimeAsync(0);

    // Simulate tab activation
    mockListeners.onActivated.forEach((fn) => fn({ tabId: 1 }));
    await vi.advanceTimersByTimeAsync(50);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(mockListeners.onActivated).toHaveLength(0);
  });

  it('resolves on timeout if tab never activated', async () => {
    mockGet.mockResolvedValue({ active: false });

    const promise = waitForTabFocus(1, { maxWaitMs: 500, settleMs: 50 });
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(500);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(mockListeners.onActivated).toHaveLength(0);
  });

  it('handles chrome.tabs.get failure gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Tab not found'));

    const promise = waitForTabFocus(1, { maxWaitMs: 500, settleMs: 50 });
    await vi.advanceTimersByTimeAsync(0);

    // Should fall through to listener-based path and eventually timeout
    await vi.advanceTimersByTimeAsync(500);

    const elapsed = await promise;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(mockListeners.onActivated).toHaveLength(0);
  });
});
