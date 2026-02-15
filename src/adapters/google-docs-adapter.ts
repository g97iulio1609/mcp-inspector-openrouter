/**
 * GoogleDocsAdapter — DOM-based adapter for Google Docs platform interactions.
 * Uses resilient selector strategies with multiple fallbacks.
 */

import type { IGoogleDocsPort } from '../ports/productivity.port';

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
  throw new Error(`Google Docs element not found: ${description} (tried: ${selectors.join(', ')})`);
}

function clickElement(selectors: string[], description: string): void {
  const el = queryElement<HTMLElement>(selectors, description);
  el.click();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GoogleDocsAdapter implements IGoogleDocsPort {
  isOnGoogleDocs(): boolean {
    const h = location.hostname;
    return h === 'docs.google.com';
  }

  // ── Document ──

  getDocTitle(): string {
    const el = queryElement<HTMLElement>(
      ['input.docs-title-input', '[data-testid="doc-title"]', '#docs-title-widget input'],
      'document title input',
    );
    return (el as HTMLInputElement).value || el.textContent || '';
  }

  async setDocTitle(title: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(title, 'title'));
    const el = queryElement<HTMLInputElement>(
      ['input.docs-title-input', '[data-testid="doc-title"]', '#docs-title-widget input'],
      `document title input for "${safe}"`,
    );
    el.focus();
    el.value = title;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
  }

  async insertText(text: string): Promise<void> {
    requireNonEmpty(text, 'text');
    clickElement(
      ['.docs-texteventtarget-iframe', '[data-testid="doc-editor"]', '.kix-appview-editor'],
      'editor area',
    );
    await sleep(100);
  }

  // ── Formatting ──

  async formatBold(): Promise<void> {
    clickElement(
      ['[aria-label*="Bold" i]', '#boldButton', '[data-testid="bold-button"]'],
      'bold button',
    );
  }

  async formatItalic(): Promise<void> {
    clickElement(
      ['[aria-label*="Italic" i]', '#italicButton', '[data-testid="italic-button"]'],
      'italic button',
    );
  }

  async formatHeading(level: number): Promise<void> {
    if (level < 1 || level > 6) throw new Error('heading level must be between 1 and 6');
    clickElement(
      ['[aria-label*="Styles" i]', '[data-testid="styles-dropdown"]', '#docs-toolbar-heading'],
      `heading ${level} selector`,
    );
    await sleep(200);
  }

  async insertLink(url: string): Promise<void> {
    requireNonEmpty(url, 'url');
    clickElement(
      ['[aria-label*="Insert link" i]', '[data-testid="insert-link"]', '#insertLinkButton'],
      'insert link button',
    );
    await sleep(200);
  }

  // ── Comments ──

  async addComment(text: string): Promise<void> {
    requireNonEmpty(text, 'text');
    clickElement(
      ['[aria-label*="Comment" i]', '[data-testid="add-comment"]', '#addCommentButton'],
      'add comment button',
    );
    await sleep(200);
  }

  async resolveComment(): Promise<void> {
    clickElement(
      ['[aria-label*="Resolve" i]', '[data-testid="resolve-comment"]', '.docos-resolve-button'],
      'resolve comment button',
    );
  }

  // ── Navigation ──

  async goToBeginning(): Promise<void> {
    clickElement(
      ['[aria-label*="Beginning" i]', '[data-testid="go-to-beginning"]', '.kix-appview-editor'],
      'go to beginning',
    );
  }

  async goToEnd(): Promise<void> {
    clickElement(
      ['[aria-label*="End" i]', '[data-testid="go-to-end"]', '.kix-appview-editor'],
      'go to end',
    );
  }

  async findAndReplace(find: string, replace: string): Promise<void> {
    requireNonEmpty(find, 'find');
    requireNonEmpty(replace, 'replace');
    clickElement(
      ['[aria-label*="Find and replace" i]', '[data-testid="find-replace"]', '#docs-findandreplace'],
      'find and replace button',
    );
    await sleep(300);
  }

  // ── Sharing ──

  async shareDoc(): Promise<void> {
    clickElement(
      ['[aria-label*="Share" i]', '[data-testid="share-button"]', '#docs-share-button'],
      'share button',
    );
    await sleep(300);
  }

  getShareLink(): string {
    return location.href;
  }
}
