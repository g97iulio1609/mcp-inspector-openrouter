import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Chrome API mocks ──

const mockSendMessage = vi.fn();
const mockRuntimeSendMessage = vi.fn();
const mockTabsUpdate = vi.fn();
const mockExecuteScript = vi.fn();
const listeners: Function[] = [];

vi.stubGlobal('chrome', {
  tabs: { sendMessage: mockSendMessage, update: mockTabsUpdate },
  runtime: {
    sendMessage: mockRuntimeSendMessage,
    onMessage: {
      addListener: vi.fn((fn: Function) => listeners.push(fn)),
      removeListener: vi.fn((fn: Function) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      }),
    },
  },
  scripting: { executeScript: mockExecuteScript },
});

vi.mock('../../sidebar/debug-logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { ChromeToolAdapter } from '../chrome-tool-adapter';
import type { CleanTool } from '../../types';

function makeTool(overrides: Partial<CleanTool> = {}): CleanTool {
  return {
    name: 'click_button',
    description: 'Clicks a button',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
    ...overrides,
  } as CleanTool;
}

describe('ChromeToolAdapter', () => {
  let adapter: ChromeToolAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    listeners.length = 0;
    // Default: PING succeeds (content script already injected)
    mockSendMessage.mockResolvedValue(undefined);
    adapter = new ChromeToolAdapter();
  });

  // ── execute routing ──

  describe('execute routing', () => {
    it('routes browser.* tools to executeBrowserTool', async () => {
      mockRuntimeSendMessage.mockResolvedValue({ success: true, data: 'ok' });
      const result = await adapter.execute('browser.screenshot', {}, { tabId: 1 });
      expect(mockRuntimeSendMessage).toHaveBeenCalledWith({
        action: 'EXECUTE_BROWSER_TOOL',
        name: 'browser.screenshot',
        args: {},
      });
      expect(result.success).toBe(true);
    });

    it('routes non-browser tools to executeContentTool', async () => {
      mockSendMessage.mockResolvedValue({ success: true, message: 'done' });
      const result = await adapter.execute('click_button', {}, { tabId: 1 });
      expect(mockSendMessage).toHaveBeenCalledWith(1, {
        action: 'EXECUTE_TOOL',
        name: 'click_button',
        inputArgs: '{}',
      });
      expect(result.success).toBe(true);
    });
  });

  // ── executeBrowserTool ──

  describe('executeBrowserTool', () => {
    it('returns success with data field preserved', async () => {
      mockRuntimeSendMessage.mockResolvedValue({ success: true, data: { url: 'https://x.com' } });
      const result = await adapter.execute('browser.navigate', {}, { tabId: 1 });
      expect(result).toEqual({ success: true, data: { url: 'https://x.com' } });
    });

    it('returns success with message fallback when no data', async () => {
      mockRuntimeSendMessage.mockResolvedValue({ success: true, message: 'navigated' });
      const result = await adapter.execute('browser.navigate', {}, { tabId: 1 });
      expect(result).toEqual({ success: true, data: 'navigated' });
    });

    it('returns failure with error message', async () => {
      mockRuntimeSendMessage.mockResolvedValue({ success: false, message: 'tab not found' });
      const result = await adapter.execute('browser.close', {}, { tabId: 1 });
      expect(result).toEqual({ success: false, error: 'tab not found' });
    });

    it('catches exceptions and returns failure', async () => {
      mockRuntimeSendMessage.mockRejectedValue(new Error('disconnected'));
      const result = await adapter.execute('browser.click', {}, { tabId: 1 });
      expect(result).toEqual({ success: false, error: 'disconnected' });
    });
  });

  // ── executeContentTool ──

  describe('executeContentTool', () => {
    it('returns structured success with data field', async () => {
      // First call: PING, second call: EXECUTE_TOOL
      mockSendMessage
        .mockResolvedValueOnce(undefined) // PING
        .mockResolvedValueOnce({ success: true, message: 'clicked', data: { id: 42 } });
      const result = await adapter.execute('click_button', { sel: '#btn' }, { tabId: 5 });
      expect(result).toEqual({ success: true, data: { id: 42 } });
    });

    it('returns structured success with message fallback', async () => {
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ success: true, message: 'clicked' });
      const result = await adapter.execute('click_button', {}, { tabId: 5 });
      expect(result).toEqual({ success: true, data: 'clicked' });
    });

    it('returns structured failure', async () => {
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ success: false, message: 'element not found' });
      const result = await adapter.execute('click_button', {}, { tabId: 5 });
      expect(result).toEqual({ success: false, error: 'element not found' });
    });

    it('handles raw string response', async () => {
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce('raw string result');
      const result = await adapter.execute('read_text', {}, { tabId: 5 });
      expect(result).toEqual({ success: true, data: 'raw string result' });
    });

    it('handles raw object response (JSON stringified)', async () => {
      const rawObj = { foo: 'bar' };
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(rawObj);
      const result = await adapter.execute('get_data', {}, { tabId: 5 });
      expect(result).toEqual({ success: true, data: JSON.stringify(rawObj) });
    });

    it('catches exception and returns failure', async () => {
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('tab crashed'));
      const result = await adapter.execute('click_button', {}, { tabId: 5 });
      expect(result).toEqual({ success: false, error: 'tab crashed' });
    });

    it('cross-tab focuses tab first', async () => {
      vi.useFakeTimers();
      mockTabsUpdate.mockResolvedValue(undefined);
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ success: true, message: 'ok' });

      const promise = adapter.execute('click_button', {}, { tabId: 10, originTabId: 1 });
      await vi.advanceTimersByTimeAsync(300);
      const result = await promise;

      expect(mockTabsUpdate).toHaveBeenCalledWith(10, { active: true });
      expect(result.success).toBe(true);
      vi.useRealTimers();
    });
  });

  // ── getAvailableTools ──

  describe('getAvailableTools', () => {
    it('returns mapped ToolDefinition array', async () => {
      const tools: CleanTool[] = [
        makeTool({ name: 'a', description: 'desc A', category: 'navigation' }),
        makeTool({ name: 'b', description: 'desc B' }),
      ];
      mockSendMessage
        .mockResolvedValueOnce(undefined) // PING
        .mockResolvedValueOnce({ tools });

      const defs = await adapter.getAvailableTools(1);
      expect(defs).toEqual([
        { name: 'a', description: 'desc A', parametersSchema: { type: 'object', properties: {}, required: [] }, category: 'navigation' },
        { name: 'b', description: 'desc B', parametersSchema: { type: 'object', properties: {}, required: [] }, category: undefined },
      ]);
    });

    it('handles string inputSchema via JSON.parse', async () => {
      const schema = { type: 'object', properties: { q: { type: 'string' } } };
      const tools: CleanTool[] = [
        makeTool({ name: 'search', inputSchema: JSON.stringify(schema) as unknown as CleanTool['inputSchema'] }),
      ];
      mockSendMessage
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ tools });

      const defs = await adapter.getAvailableTools(2);
      expect(defs[0].parametersSchema).toEqual(schema);
    });

    it('returns empty array on error', async () => {
      mockSendMessage.mockRejectedValue(new Error('no tab'));
      const defs = await adapter.getAvailableTools(999);
      expect(defs).toEqual([]);
    });
  });

  // ── onToolsChanged ──

  describe('onToolsChanged', () => {
    it('calls callback when message has tools', () => {
      const cb = vi.fn();
      adapter.onToolsChanged(cb);

      const tools: CleanTool[] = [makeTool({ name: 'x' })];
      listeners[0]({ tools });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0][0].name).toBe('x');
    });

    it('ignores messages without tools', () => {
      const cb = vi.fn();
      adapter.onToolsChanged(cb);

      listeners[0]({ action: 'OTHER' });
      expect(cb).not.toHaveBeenCalled();
    });

    it('unsubscribe removes listener', () => {
      const cb = vi.fn();
      const unsub = adapter.onToolsChanged(cb);
      expect(listeners).toHaveLength(1);

      unsub();
      expect(listeners).toHaveLength(0);
      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
    });

    it('catches callback errors (does not throw)', () => {
      const cb = vi.fn(() => { throw new Error('callback boom'); });
      adapter.onToolsChanged(cb);

      expect(() => listeners[0]({ tools: [makeTool()] })).not.toThrow();
    });
  });
});
