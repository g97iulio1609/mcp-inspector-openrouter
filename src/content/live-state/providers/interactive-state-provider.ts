/**
 * InteractiveStateProvider — collects live state for interactive UI widgets.
 *
 * Detects open modals, expanded accordions, open dropdowns,
 * active tooltips, and visible notifications.
 */

import type { IStateProvider, InteractiveLiveState } from '../../../types/live-state.types';

const MODAL_SELECTOR = [
  'dialog[open]',
  '[role="dialog"]:not([aria-hidden="true"])',
  '.modal.show',
  '.modal.open',
  '[class*="modal" i][class*="open" i]',
].join(', ');

const DROPDOWN_SELECTOR = [
  '[role="listbox"]:not([aria-hidden="true"])',
  'select:focus',
  '[role="combobox"][aria-expanded="true"]',
].join(', ');

const NOTIFICATION_SELECTOR = [
  '[role="alert"]',
  '[role="status"]',
  '[class*="toast" i]:not([aria-hidden="true"])',
  '[class*="notification" i]:not([aria-hidden="true"])',
].join(', ');

/** Truncate a string to a maximum length */
function truncate(value: string, max = 100): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Extract a label from an element: aria-label, first heading, or trimmed text */
function extractLabel(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return truncate(ariaLabel);

  const heading = el.querySelector('h1, h2, h3, h4');
  if (heading?.textContent?.trim()) return truncate(heading.textContent.trim());

  const text = el.textContent?.trim();
  return text ? truncate(text) : '';
}

export class InteractiveStateProvider implements IStateProvider<InteractiveLiveState> {
  readonly category = 'interactive' as const;

  collect(root: Document | Element): InteractiveLiveState {
    // Open modals
    const openModals = Array.from(root.querySelectorAll(MODAL_SELECTOR)).map(extractLabel);

    // Expanded accordions (limit to 10)
    const expandedAccordions = Array.from(root.querySelectorAll('[aria-expanded="true"]'))
      .slice(0, 10)
      .map((el) => {
        const label =
          el.getAttribute('aria-label')?.trim() || el.textContent?.trim() || '';
        return truncate(label);
      });

    // Open dropdowns
    const openDropdowns = Array.from(root.querySelectorAll(DROPDOWN_SELECTOR)).map((el) => {
      const label =
        el.getAttribute('aria-label')?.trim() || el.textContent?.trim() || '';
      return truncate(label);
    });

    // Active tooltips
    const activeTooltips = Array.from(
      root.querySelectorAll('[role="tooltip"]:not([aria-hidden="true"])'),
    ).map((el) => truncate(el.textContent?.trim() || ''));

    // Visible notifications (limit to 5)
    const visibleNotifications = Array.from(root.querySelectorAll(NOTIFICATION_SELECTOR))
      .slice(0, 5)
      .map((el) => truncate(el.textContent?.trim() || ''));

    return {
      openModals,
      expandedAccordions,
      openDropdowns,
      activeTooltips,
      visibleNotifications,
    };
  }

  dispose(): void {
    /* no-op */
  }
}
