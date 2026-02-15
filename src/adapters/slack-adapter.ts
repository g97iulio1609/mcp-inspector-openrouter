/**
 * SlackAdapter — DOM-based adapter for Slack platform interactions.
 * Uses resilient selector strategies with multiple fallbacks.
 */

import type { ISlackPort } from '../ports/productivity.port';

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
  throw new Error(`Slack element not found: ${description} (tried: ${selectors.join(', ')})`);
}

function clickElement(selectors: string[], description: string): void {
  const el = queryElement<HTMLElement>(selectors, description);
  el.click();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SlackAdapter implements ISlackPort {
  isOnSlack(): boolean {
    const h = location.hostname;
    return h === 'app.slack.com' || h === 'slack.com' || h.endsWith('.slack.com');
  }

  // ── Messaging ──

  async sendMessage(text: string): Promise<void> {
    requireNonEmpty(text, 'text');
    const editor = queryElement<HTMLElement>(
      ['[data-testid="message-input"]', '[aria-label*="Message" i]', '.ql-editor'],
      'message input',
    );
    editor.focus();
    editor.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    clickElement(
      ['[data-testid="send-button"]', '[aria-label*="Send" i]', 'button.c-wysiwyg_container__button--send'],
      'send button',
    );
  }

  async replyInThread(text: string): Promise<void> {
    requireNonEmpty(text, 'text');
    clickElement(
      ['[data-testid="reply-in-thread"]', '[aria-label*="Reply" i]', '.c-message_actions__button--thread'],
      'reply in thread button',
    );
    await sleep(200);
  }

  async addReaction(emoji: string): Promise<void> {
    requireNonEmpty(emoji, 'emoji');
    clickElement(
      ['[data-testid="add-reaction"]', '[aria-label*="Add reaction" i]', '.c-reaction-add'],
      'add reaction button',
    );
    await sleep(200);
  }

  async editLastMessage(): Promise<void> {
    clickElement(
      ['[data-testid="edit-message"]', '[aria-label*="Edit message" i]', '.c-message_actions__button--edit'],
      'edit message button',
    );
    await sleep(200);
  }

  async deleteLastMessage(): Promise<void> {
    clickElement(
      ['[data-testid="delete-message"]', '[aria-label*="Delete message" i]', '.c-message_actions__button--delete'],
      'delete message button',
    );
    await sleep(200);
  }

  // ── Navigation ──

  async switchChannel(channel: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(channel, 'channel'));
    clickElement(
      [`[data-testid="channel-${safe}"]`, `[aria-label="${safe}"]`, `.p-channel_sidebar__channel--${safe}`],
      `channel "${safe}"`,
    );
    await sleep(200);
  }

  async searchMessages(query: string): Promise<void> {
    requireNonEmpty(query, 'query');
    const input = queryElement<HTMLInputElement>(
      ['[data-testid="search-input"]', 'input[aria-label*="Search" i]', '.c-search__input'],
      'search input',
    );
    input.focus();
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
  }

  async createChannel(name: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(name, 'name'));
    clickElement(
      ['[data-testid="create-channel"]', '[aria-label*="Create channel" i]', '.p-channel_sidebar__create_channel'],
      `create channel "${safe}"`,
    );
    await sleep(300);
  }

  // ── Status ──

  async setStatus(status: string): Promise<void> {
    requireNonEmpty(status, 'status');
    clickElement(
      ['[data-testid="set-status"]', '[aria-label*="Set a status" i]', '.p-ia__nav__user__button'],
      'set status button',
    );
    await sleep(200);
  }

  async setAvailability(_available: boolean): Promise<void> {
    clickElement(
      ['[data-testid="set-availability"]', '[aria-label*="availability" i]', '.p-ia__nav__user__presence'],
      'set availability button',
    );
    await sleep(200);
  }

  // ── Files & Views ──

  async uploadFile(): Promise<void> {
    clickElement(
      ['[data-testid="upload-file"]', '[aria-label*="Upload" i]', '.c-texty_input__button--file'],
      'upload file button',
    );
    await sleep(200);
  }

  async goToThreads(): Promise<void> {
    clickElement(
      ['[data-testid="threads-view"]', '[aria-label*="Threads" i]', '.p-channel_sidebar__link--threads'],
      'threads view button',
    );
  }

  async goToDMs(): Promise<void> {
    clickElement(
      ['[data-testid="dms-view"]', '[aria-label*="Direct messages" i]', '.p-channel_sidebar__link--dms'],
      'DMs view button',
    );
  }

  async goToMentions(): Promise<void> {
    clickElement(
      ['[data-testid="mentions-view"]', '[aria-label*="Mentions" i]', '.p-channel_sidebar__link--mentions'],
      'mentions view button',
    );
  }
}
