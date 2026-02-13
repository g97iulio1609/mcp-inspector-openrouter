/**
 * IContextPort — contract for context awareness and state management.
 *
 * Bridges page context, live state, and conversation history into a
 * unified interface that agents can query for decision-making.
 */

import type {
  ContextSummary,
  LiveStateSnapshot,
  Message,
  PageContext,
} from './types';

export interface IContextPort {
  /** Get the current page context for a given tab */
  getPageContext(tabId: number): Promise<PageContext | null>;

  /** Get the latest live state snapshot, or null if unavailable */
  getLiveState(): LiveStateSnapshot | null;

  /** Get conversation history for the current session */
  getConversationHistory(): readonly Message[];

  /** Summarise messages if they exceed the token budget */
  summarizeIfNeeded(
    messages: readonly Message[],
    tokenBudget: number,
  ): Promise<ContextSummary>;
}
