/**
 * NavigationStateProvider — collects live state for page navigation.
 *
 * Reports the current URL, scroll position, visible heading section,
 * active ARIA tab, and breadcrumb trail.
 */

import type { IStateProvider, NavigationLiveState } from '../../../types/live-state.types';

/** Truncate a string to a maximum length */
function truncate(value: string, max = 100): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Find the heading (h1-h3) closest to the top of the viewport */
function findVisibleSection(root: Document | Element): string | undefined {
  const headings = root.querySelectorAll('h1, h2, h3');
  let best: Element | undefined;
  let bestDistance = Infinity;

  headings.forEach((h) => {
    const rect = h.getBoundingClientRect();
    const distance = Math.abs(rect.top);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = h;
    }
  });

  const text = best ? best.textContent?.trim() : undefined;
  return text ? truncate(text) : undefined;
}

export class NavigationStateProvider implements IStateProvider<NavigationLiveState> {
  readonly category = 'navigation' as const;

  collect(root: Document | Element): NavigationLiveState {
    const doc = root instanceof Document ? root : root.ownerDocument!;

    // Scroll percentage (clamped 0–100)
    const scrollHeight = doc.documentElement.scrollHeight - window.innerHeight;
    const rawPercent =
      scrollHeight > 0
        ? Math.round((window.scrollY / scrollHeight) * 100)
        : 0;
    const scrollPercent = Math.max(0, Math.min(100, rawPercent));

    // Active ARIA tab
    const activeTabEl = root.querySelector('[role="tab"][aria-selected="true"]');
    const activeTab = activeTabEl?.textContent?.trim();

    // Breadcrumb trail
    const crumbEls = root.querySelectorAll(
      'nav[aria-label*="breadcrumb" i] a, [class*="breadcrumb" i] a',
    );
    const breadcrumb =
      crumbEls.length > 0
        ? Array.from(crumbEls)
            .map((el) => truncate(el.textContent?.trim() || ''))
            .filter(Boolean)
        : undefined;

    return {
      currentUrl: doc.location?.href ?? '',
      scrollPercent,
      visibleSection: findVisibleSection(root),
      ...(activeTab ? { activeTab: truncate(activeTab) } : {}),
      ...(breadcrumb ? { breadcrumb } : {}),
    };
  }

  dispose(): void {
    /* no-op */
  }
}
