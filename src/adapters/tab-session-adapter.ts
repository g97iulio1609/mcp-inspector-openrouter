/**
 * TabSessionAdapter — manages multi-tab session context.
 * Accumulates data extracted from each tab during a workflow,
 * making it available for AI context injection.
 */

import type { ITabSessionPort, TabContext } from '../ports/tab-session.port';

export class TabSessionAdapter implements ITabSessionPort {
  private sessionId: string | null = null;
  private readonly contexts = new Map<number, TabContext>();

  startSession(): string {
    this.endSession();
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.sessionId;
  }

  setTabContext(tabId: number, context: Omit<TabContext, 'tabId' | 'timestamp'>): void {
    if (!this.sessionId) return;
    const existing = this.contexts.get(tabId);
    this.contexts.set(tabId, {
      tabId,
      ...context,
      extractedData: { ...existing?.extractedData, ...context.extractedData },
      timestamp: Date.now(),
    });
  }

  storeData(tabId: number, key: string, value: unknown): void {
    if (!this.sessionId) return;
    const existing = this.contexts.get(tabId);
    if (!existing) return;
    this.contexts.set(tabId, {
      ...existing,
      extractedData: { ...existing.extractedData, [key]: value },
      timestamp: Date.now(),
    });
  }

  getTabContext(tabId: number): TabContext | undefined {
    return this.contexts.get(tabId);
  }

  getAllContexts(): readonly TabContext[] {
    return [...this.contexts.values()];
  }

  buildContextSummary(): string {
    if (this.contexts.size === 0) return '';

    const lines: string[] = ['## Multi-Tab Session Context'];
    for (const ctx of this.contexts.values()) {
      lines.push(`\n### Tab: ${ctx.title} (${ctx.url})`);
      const keys = Object.keys(ctx.extractedData);
      if (keys.length > 0) {
        for (const key of keys) {
          const val = ctx.extractedData[key];
          let str: string;
          if (typeof val === 'string') {
            str = val;
          } else {
            try { str = JSON.stringify(val) ?? String(val); } catch { str = String(val); }
          }
          lines.push(`- ${key}: ${str.length > 200 ? str.slice(0, 200) + '…' : str}`);
        }
      }
    }
    return lines.join('\n');
  }

  endSession(): void {
    this.sessionId = null;
    this.contexts.clear();
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
