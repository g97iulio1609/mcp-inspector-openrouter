/**
 * Chatbot executor: types prompts into AI chatbot inputs and clicks send buttons.
 *
 * Handles both contenteditable divs (Claude, Gemini) and textareas (ChatGPT, Grok)
 * using framework-compatible value setting.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class ChatbotExecutor extends BaseExecutor {
  readonly category = 'chatbot' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool);
    if (!el) return this.fail('Chatbot element not found');

    if (tool.name === 'chatbot.type-prompt') {
      return this.typePrompt(el, args);
    }
    if (tool.name === 'chatbot.send-message') {
      return this.sendMessage(el);
    }
    return this.fail(`Unknown chatbot tool: "${tool.name}"`);
  }

  private async typePrompt(
    el: Element,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const parsed = this.parseArgs(args);
    const text = String(parsed.text ?? '');

    const htmlEl = el as HTMLElement;
    htmlEl.focus();

    if (el.getAttribute('contenteditable') === 'true') {
      // Contenteditable div (Claude, Gemini, etc.)
      // Clear existing content, then insert via execCommand for React/ProseMirror compat
      const selection = window.getSelection();
      if (selection) {
        selection.selectAllChildren(htmlEl);
        selection.deleteFromDocument();
      }
      document.execCommand('insertText', false, text);
      this.dispatchEvents(el, ['input', 'change']);
    } else {
      // Textarea (ChatGPT, Grok, etc.)
      const textarea = el as HTMLTextAreaElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;

      // First try: native setter + bulk events (works for ChatGPT)
      if (nativeSetter) {
        nativeSetter.call(textarea, text);
      } else {
        textarea.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));

      // Wait briefly, then check if React picked it up
      await new Promise((r) => setTimeout(r, 50));

      // If the textarea value was reset by React, simulate char-by-char typing.
      // This is needed for Grok and other React apps that don't respond to bulk value setting.
      if (textarea.value !== text) {
        if (nativeSetter) {
          nativeSetter.call(textarea, '');
        } else {
          textarea.value = '';
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));

        for (const char of text) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          if (nativeSetter) {
            nativeSetter.call(textarea, textarea.value + char);
          } else {
            textarea.value += char;
          }
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }
      }
    }

    // Let frameworks react
    await new Promise((r) => setTimeout(r, 150));

    return this.ok(`Typed prompt: "${text}"`);
  }

  private async sendMessage(el: Element): Promise<ExecutionResult> {
    const btn = el as HTMLButtonElement;
    // Some chatbots disable the send button until input has content — wait up to 1s
    for (let i = 0; i < 10 && (btn.disabled || btn.getAttribute('aria-disabled') === 'true'); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
      // Fallback: try pressing Enter on the textarea instead
      const textarea = btn.closest('form')?.querySelector('textarea')
        ?? document.querySelector('textarea');
      if (textarea) {
        (textarea as HTMLElement).focus();
        textarea.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
        );
        return this.ok('Send via Enter key (button was disabled)');
      }
      return this.fail('Send button is still disabled — input may not have been recognized');
    }
    btn.click();
    return this.ok('Send button clicked');
  }
}
