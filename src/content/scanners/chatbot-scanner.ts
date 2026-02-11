/**
 * Chatbot Scanner — discovers AI chatbot input fields (ChatGPT, Claude, Gemini, Grok, etc.)
 * and their associated send buttons.
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

/** Selectors for AI chatbot input fields, ordered from specific to generic */
const CHATBOT_INPUT_SELECTORS = [
  // ChatGPT
  '#prompt-textarea',
  'textarea[data-id="root"]',
  'div[contenteditable="true"][id*="prompt"]',
  // Claude
  'div[contenteditable="true"].ProseMirror',
  'div.ProseMirror[contenteditable]',
  // Gemini
  'div[contenteditable="true"][aria-label*="prompt" i]',
  'rich-textarea',
  // Grok / X.com — textarea inside complex React wrapper
  'textarea[autocapitalize="sentences"]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Chiedi" i]',
  'textarea[placeholder*="Frag" i]',
  'textarea[placeholder*="Demande" i]',
  'textarea[placeholder*="Pregunta" i]',
  'textarea[placeholder*="anything" i]',
  'textarea[placeholder*="qualsiasi" i]',
  'div[contenteditable="true"][role="textbox"]',
  // Generic patterns
  'textarea[aria-label*="message" i]',
  'textarea[placeholder*="message" i]',
  'textarea[placeholder*="messag" i]',
].join(', ');

/** Selectors for send buttons — order: specific → generic */
const SEND_BUTTON_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label*="send" i]',
  'button[aria-label*="invia" i]',
  'button[aria-label*="envoyer" i]',
  'button[aria-label*="enviar" i]',
  'button[aria-label*="senden" i]',
  // Grok-specific: button with arrow SVG near the textarea (any language)
  'button[aria-label*="Grok" i]',
  'button[aria-label*="grok" i]',
];

export class ChatbotScanner extends BaseScanner {
  readonly category = 'chatbot' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    let inputs: Element[] = Array.from((root as ParentNode).querySelectorAll(CHATBOT_INPUT_SELECTORS));
    const seen = new Set<Element>();

    // Heuristic fallback: if no inputs matched, look for a lone visible textarea
    // with no name attribute (common in React chatbot UIs like Grok)
    if (inputs.length === 0) {
      const allTextareas = (root as ParentNode).querySelectorAll('textarea');
      const visibleTextareas = Array.from(allTextareas).filter(
        (ta) => !ta.getAttribute('name') && this.isVisible(ta),
      );
      if (visibleTextareas.length === 1) {
        inputs = visibleTextareas;
      }
    }

    for (const inp of Array.from(inputs)) {
      if (seen.has(inp) || this.isClaimed(inp) || !this.isVisible(inp)) continue;
      seen.add(inp);

      const siteName = this.getSiteName();
      const label = this.getLabel(inp) || 'chat input';

      // Type-prompt tool
      tools.push(
        this.createTool(
          'chatbot.type-prompt',
          `Type a prompt in ${siteName} chat`,
          inp,
          this.makeInputSchema([
            {
              name: 'text',
              type: 'string',
              description: 'The text to type in the chat input',
              required: true,
            },
          ]),
          this.computeConfidence({
            hasAria: !!inp.getAttribute('aria-label'),
            hasLabel: !!label,
            hasName: !!inp.getAttribute('name'),
            isVisible: true,
            hasRole: !!inp.getAttribute('role'),
            hasSemanticTag: inp.tagName === 'TEXTAREA',
          }),
        ),
      );
      this.claim(inp);

      // Find send button near the input
      const sendBtn = this.findSendButton(inp, root);
      if (sendBtn && !this.isClaimed(sendBtn)) {
        tools.push(
          this.createTool(
            'chatbot.send-message',
            `Send message in ${siteName} chat`,
            sendBtn,
            this.makeInputSchema([]),
            this.computeConfidence({
              hasAria: !!sendBtn.getAttribute('aria-label'),
              hasLabel: !!this.getLabel(sendBtn),
              hasName: false,
              isVisible: this.isVisible(sendBtn),
              hasRole: sendBtn.tagName === 'BUTTON',
              hasSemanticTag: sendBtn.tagName === 'BUTTON',
            }),
          ),
        );
        this.claim(sendBtn);
      }

      if (tools.length >= this.maxTools) break;
    }

    return tools;
  }

  /** Derive a human-friendly site name from the hostname */
  private getSiteName(): string {
    try {
      const host = location.hostname.replace(/^www\./, '');
      if (host.includes('chat.openai') || host.includes('chatgpt')) return 'ChatGPT';
      if (host.includes('claude.ai')) return 'Claude';
      if (host.includes('gemini.google')) return 'Gemini';
      if (host.includes('grok') || host.includes('x.com')) return 'Grok';
      // Capitalize first segment
      return host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1);
    } catch {
      return 'AI chatbot';
    }
  }

  /** Find the send button closest to a chatbot input */
  private findSendButton(
    input: Element,
    root: Document | Element | ShadowRoot,
  ): Element | null {
    // Check known selectors first
    for (const sel of SEND_BUTTON_SELECTORS) {
      const btn = (root as ParentNode).querySelector(sel);
      if (btn && this.isVisible(btn)) return btn;
    }

    // Walk up from the input to find the closest container with a button.
    // Grok nests textarea very deeply, so walk up to 12 levels.
    let container: Element | null = input;
    for (let i = 0; i < 12 && container; i++) {
      container = container.parentElement;
      if (!container) break;
      // Look for submit-like buttons (including disabled ones — Grok disables until text is entered)
      const buttons = container.querySelectorAll('button');
      for (const btn of buttons) {
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() ?? '';
        const hasSvg = !!btn.querySelector('svg');
        // Match buttons that look like send buttons (have arrow SVG, or aria hint)
        if (
          ariaLabel.includes('send') ||
          ariaLabel.includes('invia') ||
          ariaLabel.includes('grok') ||
          ariaLabel.includes('submit') ||
          (hasSvg && btn.closest('form'))
        ) {
          return btn;
        }
      }
      // If we found a form or major container, try the first button with an SVG
      if (container.tagName === 'FORM' || container.querySelectorAll('textarea, [contenteditable]').length > 0) {
        const svgBtn = container.querySelector('button svg[viewBox]')?.closest('button');
        if (svgBtn) return svgBtn;
      }
    }

    // Fallback: find a button with an SVG near the input's parent
    const fallback = input.closest('form') || input.parentElement?.parentElement;
    if (fallback) {
      const btn = fallback.querySelector('button svg[viewBox]')?.closest('button');
      if (btn && this.isVisible(btn)) return btn;
    }
    return null;
  }
}
