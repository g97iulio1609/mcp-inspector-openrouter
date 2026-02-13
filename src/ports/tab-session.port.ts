/**
 * ITabSessionPort — contract for multi-tab session management.
 * Tracks context accumulated across tabs during a multi-step workflow.
 */

/** Context extracted from a single tab during a session */
export interface TabContext {
  readonly tabId: number;
  readonly url: string;
  readonly title: string;
  /** Key-value data extracted from this tab (e.g., search results, form values) */
  readonly extractedData: Record<string, unknown>;
  /** Timestamp when this context was captured */
  readonly timestamp: number;
}

export interface ITabSessionPort {
  /** Start a new multi-tab session */
  startSession(): string;

  /** Add or update context for a tab */
  setTabContext(tabId: number, context: Omit<TabContext, 'tabId' | 'timestamp'>): void;

  /** Store extracted data from a tab (e.g., search results, form values) */
  storeData(tabId: number, key: string, value: unknown): void;

  /** Get context for a specific tab */
  getTabContext(tabId: number): TabContext | undefined;

  /** Get all accumulated context across all tabs in the session */
  getAllContexts(): readonly TabContext[];

  /** Build a summary string of accumulated context for AI system prompt */
  buildContextSummary(): string;

  /** End the current session and clear all context */
  endSession(): void;

  /** Get current session ID (null if no active session) */
  getSessionId(): string | null;
}
