import { describe, it, expect, beforeEach } from 'vitest';
import { TabSessionAdapter } from '../tab-session-adapter';

describe('TabSessionAdapter', () => {
  let adapter: TabSessionAdapter;

  beforeEach(() => {
    adapter = new TabSessionAdapter();
  });

  // ── startSession ──

  it('startSession returns a session ID', () => {
    const id = adapter.startSession();
    expect(id).toMatch(/^session-\d+-[a-z0-9]+$/);
    expect(adapter.getSessionId()).toBe(id);
  });

  it('startSession cleans up prior session', () => {
    adapter.startSession();
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: {} });
    adapter.startSession();
    expect(adapter.getAllContexts()).toHaveLength(0);
  });

  // ── setTabContext ──

  it('setTabContext stores context for a tab', () => {
    adapter.startSession();
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: { k: 'v' } });
    const ctx = adapter.getTabContext(1);
    expect(ctx).toBeDefined();
    expect(ctx!.tabId).toBe(1);
    expect(ctx!.url).toBe('https://a.com');
    expect(ctx!.title).toBe('A');
    expect(ctx!.extractedData).toEqual({ k: 'v' });
    expect(ctx!.timestamp).toBeGreaterThan(0);
  });

  it('setTabContext merges extractedData with existing', () => {
    adapter.startSession();
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: { a: 1 } });
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: { b: 2 } });
    const ctx = adapter.getTabContext(1);
    expect(ctx!.extractedData).toEqual({ a: 1, b: 2 });
  });

  it('setTabContext is no-op without active session', () => {
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: {} });
    expect(adapter.getTabContext(1)).toBeUndefined();
  });

  // ── storeData ──

  it('storeData adds key-value to existing tab context', () => {
    adapter.startSession();
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: {} });
    adapter.storeData(1, 'result', 'hello');
    expect(adapter.getTabContext(1)!.extractedData).toEqual({ result: 'hello' });
  });

  it('storeData is no-op without active session', () => {
    adapter.startSession();
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: {} });
    adapter.endSession();
    adapter.storeData(1, 'k', 'v');
    // Context was cleared by endSession, so nothing to verify on the tab itself
    expect(adapter.getTabContext(1)).toBeUndefined();
  });

  it('storeData is no-op for unknown tab', () => {
    adapter.startSession();
    adapter.storeData(999, 'k', 'v');
    expect(adapter.getTabContext(999)).toBeUndefined();
  });

  // ── getTabContext ──

  it('getTabContext returns undefined for unknown tab', () => {
    adapter.startSession();
    expect(adapter.getTabContext(42)).toBeUndefined();
  });

  // ── getAllContexts ──

  it('getAllContexts returns all tab contexts', () => {
    adapter.startSession();
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: {} });
    adapter.setTabContext(2, { url: 'https://b.com', title: 'B', extractedData: {} });
    const all = adapter.getAllContexts();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.tabId)).toEqual([1, 2]);
  });

  // ── buildContextSummary ──

  it('buildContextSummary returns empty string with no contexts', () => {
    adapter.startSession();
    expect(adapter.buildContextSummary()).toBe('');
  });

  it('buildContextSummary formats context for AI prompt', () => {
    adapter.startSession();
    adapter.setTabContext(1, {
      url: 'https://google.com',
      title: 'Google',
      extractedData: { query: 'test' },
    });
    const summary = adapter.buildContextSummary();
    expect(summary).toContain('## Multi-Tab Session Context');
    expect(summary).toContain('### Tab: Google (https://google.com)');
    expect(summary).toContain('- query: test');
  });

  it('buildContextSummary truncates long values', () => {
    adapter.startSession();
    const longValue = 'x'.repeat(300);
    adapter.setTabContext(1, {
      url: 'https://a.com',
      title: 'A',
      extractedData: { big: longValue },
    });
    const summary = adapter.buildContextSummary();
    expect(summary).toContain('…');
    // The truncated portion should be 200 chars + ellipsis
    const line = summary.split('\n').find((l) => l.startsWith('- big:'));
    expect(line!.length).toBeLessThan(longValue.length);
  });

  // ── endSession ──

  it('endSession clears all contexts and session ID', () => {
    adapter.startSession();
    adapter.setTabContext(1, { url: 'https://a.com', title: 'A', extractedData: {} });
    adapter.endSession();
    expect(adapter.getSessionId()).toBeNull();
    expect(adapter.getAllContexts()).toHaveLength(0);
  });

  // ── getSessionId ──

  it('getSessionId returns null when no session', () => {
    expect(adapter.getSessionId()).toBeNull();
  });
});
