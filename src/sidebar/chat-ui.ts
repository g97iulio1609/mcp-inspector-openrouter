/**
 * chat-ui.ts — Chat bubble rendering and conversation selector UI.
 * Delegates entirely to <chat-container> Lit component for rendering.
 */

import type { Message, MessageRole } from '../types';
import type { ChatContainer as ChatContainerElement } from '../components/chat-container';

import '../components/chat-container';

// ── Public API ──

/** Clear all bubbles from the chat container */
export function clearChat(container: HTMLElement): void {
  (container as ChatContainerElement).clear();
}

/** Add a bubble to the chat UI and scroll */
export function appendBubble(
  container: HTMLElement,
  role: MessageRole,
  content: string,
  meta: Partial<Message> = {},
): void {
  (container as ChatContainerElement).appendMessage({
    role,
    content,
    ts: meta.ts ?? Date.now(),
    tool: meta.tool,
    args: meta.args,
    reasoning: meta.reasoning,
  });
}

/** Render all messages from a conversation */
export function renderConversation(
  container: HTMLElement,
  messages: readonly Message[],
): void {
  (container as ChatContainerElement).setMessages([...messages]);
}

// ── Message actions (edit/delete) ──

export interface MessageActions {
  onEdit: (index: number, newContent: string) => void;
  onDelete: (index: number) => void;
}

/** Render conversation with edit/delete actions on each message */
export function renderConversationWithActions(
  container: HTMLElement,
  messages: readonly Message[],
  actions: MessageActions,
): void {
  (container as ChatContainerElement).setMessages([...messages], true);

  // Use event delegation on the container for message-edit / message-delete
  const editHandler = ((e: CustomEvent) => {
    actions.onEdit(e.detail.index, e.detail.content);
  }) as EventListener;
  const deleteHandler = ((e: CustomEvent) => {
    actions.onDelete(e.detail.index);
  }) as EventListener;

  // Remove previous listeners (stored on element) before adding new ones
  const el = container as HTMLElement & { _editHandler?: EventListener; _deleteHandler?: EventListener };
  if (el._editHandler) container.removeEventListener('message-edit', el._editHandler);
  if (el._deleteHandler) container.removeEventListener('message-delete', el._deleteHandler);
  el._editHandler = editHandler;
  el._deleteHandler = deleteHandler;

  container.addEventListener('message-edit', editHandler);
  container.addEventListener('message-delete', deleteHandler);
}
