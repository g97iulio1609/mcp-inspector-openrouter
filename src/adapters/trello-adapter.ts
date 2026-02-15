/**
 * TrelloAdapter — DOM-based adapter for Trello platform interactions.
 * Uses resilient selector strategies with multiple fallbacks.
 */

import type { ITrelloPort } from '../ports/productivity.port';

function requireNonEmpty(value: string, paramName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${paramName} must be non-empty`);
  return trimmed;
}

function queryElement<T extends Element>(selectors: string[], description: string): T {
  for (const sel of selectors) {
    const el = document.querySelector<T>(sel);
    if (el) return el;
  }
  throw new Error(`Trello element not found: ${description} (tried: ${selectors.join(', ')})`);
}

function clickElement(selectors: string[], description: string): void {
  const el = queryElement<HTMLElement>(selectors, description);
  el.click();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TrelloAdapter implements ITrelloPort {
  isOnTrello(): boolean {
    const h = location.hostname;
    return h === 'trello.com' || h === 'www.trello.com';
  }

  // ── Cards ──

  async createCard(title: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(title, 'title'));
    clickElement(
      ['[aria-label*="Add a card" i]', '[data-testid="add-card-button"]', '.js-add-a-card'],
      `add card button for "${safe}"`,
    );
    await sleep(300);
  }

  async moveCard(listName: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(listName, 'listName'));
    clickElement(
      ['[aria-label*="Move" i]', '[data-testid="move-card"]', `.js-move-card`],
      `move card to "${safe}"`,
    );
    await sleep(200);
  }

  async archiveCard(): Promise<void> {
    clickElement(
      ['[aria-label*="Archive" i]', '[data-testid="archive-card"]', '.js-archive-card'],
      'archive card button',
    );
  }

  async addLabel(label: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(label, 'label'));
    clickElement(
      [`[data-testid="card-label-${safe}"]`, '[aria-label*="Label" i]', '.js-add-label'],
      `label "${safe}"`,
    );
    await sleep(200);
  }

  async addComment(text: string): Promise<void> {
    requireNonEmpty(text, 'text');
    const textarea = queryElement<HTMLTextAreaElement>(
      ['[data-testid="card-comment-input"]', '.js-new-comment-input', 'textarea[aria-label*="comment" i]'],
      'comment textarea',
    );
    textarea.focus();
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    clickElement(
      ['[data-testid="card-comment-save"]', '.js-save-comment', 'input[type="submit"][value="Save"]'],
      'save comment button',
    );
  }

  async assignMember(member: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(member, 'member'));
    clickElement(
      ['[aria-label*="Members" i]', '[data-testid="assign-member"]', '.js-change-card-members'],
      `assign member "${safe}"`,
    );
    await sleep(200);
  }

  async setDueDate(date: string): Promise<void> {
    requireNonEmpty(date, 'date');
    clickElement(
      ['[aria-label*="Due date" i]', '[data-testid="due-date-button"]', '.js-add-due-date'],
      'due date button',
    );
    await sleep(200);
  }

  // ── Lists ──

  async createList(name: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(name, 'name'));
    clickElement(
      ['[aria-label*="Add a list" i]', '[data-testid="add-list-button"]', '.js-add-list'],
      `add list button for "${safe}"`,
    );
    await sleep(300);
  }

  async archiveList(): Promise<void> {
    clickElement(
      ['[aria-label*="Archive list" i]', '[data-testid="archive-list"]', '.js-close-list'],
      'archive list button',
    );
  }

  // ── Search & Filter ──

  async searchCards(query: string): Promise<void> {
    requireNonEmpty(query, 'query');
    const input = queryElement<HTMLInputElement>(
      ['[data-testid="board-search-input"]', 'input[aria-label*="Search" i]', '.js-search-input'],
      'search input',
    );
    input.focus();
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
  }

  async filterByLabel(label: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(label, 'label'));
    clickElement(
      ['[aria-label*="Filter" i]', '[data-testid="filter-button"]', '.js-filter-cards'],
      `filter by label "${safe}"`,
    );
    await sleep(200);
  }

  async filterByMember(member: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(member, 'member'));
    clickElement(
      ['[aria-label*="Filter" i]', '[data-testid="filter-by-member"]', '.js-filter-by-member'],
      `filter by member "${safe}"`,
    );
    await sleep(200);
  }
}
