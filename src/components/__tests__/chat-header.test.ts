/**
 * Tests for <chat-header> Lit component.
 *
 * NOTE: happy-dom does not render Lit conditional/nested TemplateResults
 * (ternary, map, sub-method template composition). Tests verify behavior
 * via imperative method calls and event dispatch rather than DOM queries
 * where needed (same pattern as chat-bubble tests).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Stub chrome for modules that reference it at import time
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p), openOptionsPage: vi.fn() },
});

import '../chat-header';
import type { ChatHeader } from '../chat-header';
import type { ConversationSummary } from '../../types';

/** Helper: create a chat-header, attach, and wait for render */
async function createElement(props: Partial<ChatHeader> = {}): Promise<ChatHeader> {
  const el = document.createElement('chat-header') as ChatHeader;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('ChatHeader', () => {
  let el: ChatHeader;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('chat-header')).toBeDefined();
  });

  it('renders default state with no conversations and API hint hidden', async () => {
    el = await createElement();
    expect(el.showApiKeyHint).toBe(false);
    expect(el.conversations).toEqual([]);
    // Light DOM class set by connectedCallback
    expect(el.classList.contains('chat-header-wrapper')).toBe(true);
  });

  it('setConversations updates properties', async () => {
    el = await createElement();
    const convs: ConversationSummary[] = [
      { id: 'c1', title: 'Chat 1', ts: 1000 },
      { id: 'c2', title: 'Chat 2', ts: 2000 },
    ];
    el.setConversations(convs, 'c1');
    expect(el.conversations).toEqual(convs);
    expect(el.activeConversationId).toBe('c1');
  });

  it('setConversations selects the active conversation', async () => {
    el = await createElement();
    const convs: ConversationSummary[] = [
      { id: 'c1', title: 'Chat 1', ts: 1000 },
      { id: 'c2', title: 'Chat 2', ts: 2000 },
    ];
    el.setConversations(convs, 'c2');
    expect(el.activeConversationId).toBe('c2');
  });

  it('dispatches conversation-change via _onConversationChange', async () => {
    el = await createElement({
      conversations: [
        { id: 'c1', title: 'Chat 1', ts: 1000 },
        { id: 'c2', title: 'Chat 2', ts: 2000 },
      ],
      activeConversationId: 'c1',
    });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('conversation-change', (e) => resolve(e as CustomEvent), { once: true });
    });

    // Call handler directly (happy-dom limitation with Lit event bindings)
    const mockEvent = { target: { value: 'c2' } } as unknown as Event;
    (el as any)._onConversationChange(mockEvent);

    const event = await received;
    expect(event.detail.conversationId).toBe('c2');
  });

  it('dispatches new-conversation via _onNewChat', async () => {
    el = await createElement();

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('new-conversation', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onNewChat();

    const event = await received;
    expect(event.type).toBe('new-conversation');
  });

  it('dispatches delete-conversation via _onDeleteChat', async () => {
    el = await createElement();

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('delete-conversation', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onDeleteChat();

    const event = await received;
    expect(event.type).toBe('delete-conversation');
  });

  it('dispatches toggle-plan with active state via _onTogglePlan', async () => {
    el = await createElement();
    expect(el.planActive).toBe(false);

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('toggle-plan', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onTogglePlan();

    const event = await received;
    expect(event.detail.active).toBe(true);
    expect(el.planActive).toBe(true);
  });

  it('setApiKeyHint shows the hint', async () => {
    el = await createElement();
    expect(el.showApiKeyHint).toBe(false);
    el.setApiKeyHint(true);
    expect(el.showApiKeyHint).toBe(true);
  });

  it('dispatches open-options via _onOpenOptions', async () => {
    el = await createElement({ showApiKeyHint: true });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('open-options', (e) => resolve(e as CustomEvent), { once: true });
    });

    const mockEvent = { preventDefault: vi.fn() } as unknown as Event;
    (el as any)._onOpenOptions(mockEvent);

    const event = await received;
    expect(event.type).toBe('open-options');
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });
});
