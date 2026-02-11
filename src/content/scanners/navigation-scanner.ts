/**
 * Navigation Scanner — discovers ALL clickable links on the page as navigation tools.
 * Groups links by semantic page section (header, nav, main, sidebar, footer, etc.).
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

/** Semantic section identifiers for link grouping */
type PageSection = 'header' | 'nav' | 'main' | 'sidebar' | 'footer' | 'page';

export class NavigationScanner extends BaseScanner {
  readonly category = 'navigation' as const;

  protected override readonly maxTools = 200;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const seen = new Set<string>();

    const allLinks = (root as ParentNode).querySelectorAll('a[href]');

    for (const link of allLinks) {
      const href = link.getAttribute('href');
      if (
        !href ||
        href === '#' ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      )
        continue;

      const label = this.getLabel(link) || link.textContent?.trim() || '';
      if (!label || label.length < 2) continue;

      const absoluteHref = (link as HTMLAnchorElement).href;
      if (seen.has(absoluteHref)) continue;
      seen.add(absoluteHref);

      const section = this.detectSection(link as Element);
      const inNav = section === 'nav' || section === 'header';

      tools.push(
        this.createTool(
          `nav.${section}.go-${this.slugify(label)}`,
          `Navigate to: ${label} [${section}] (${absoluteHref})`,
          link as Element,
          this.makeInputSchema([]),
          this.computeConfidence({
            hasAria: !!link.getAttribute('aria-label'),
            hasLabel: true,
            hasName: true,
            isVisible: this.isVisible(link as Element),
            hasRole: inNav,
            hasSemanticTag: inNav,
          }),
          {
            title: `[${section}] ${label}`,
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
          },
        ),
      );
    }
    return tools;
  }

  /** Detect the semantic section a link belongs to */
  private detectSection(el: Element): PageSection {
    // Walk up the DOM to find the nearest semantic container
    const nav = el.closest('nav, [role="navigation"]');
    if (nav) return 'nav';

    const header = el.closest('header, [role="banner"]');
    if (header) return 'header';

    const footer = el.closest('footer, [role="contentinfo"]');
    if (footer) return 'footer';

    const aside = el.closest('aside, [role="complementary"]');
    if (aside) return 'sidebar';

    const main = el.closest('main, [role="main"], article, [role="article"]');
    if (main) return 'main';

    // Heuristic: check parent IDs/classes for common patterns
    let parent: Element | null = el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const id = parent.id?.toLowerCase() || '';
      const cls = parent.className?.toString?.()?.toLowerCase() || '';
      const combined = `${id} ${cls}`;

      if (/header|top-bar|masthead|banner/.test(combined)) return 'header';
      if (/footer|bottom|colophon/.test(combined)) return 'footer';
      if (/nav|menu|navigation|breadcrumb/.test(combined)) return 'nav';
      if (/sidebar|side-bar|aside|panel/.test(combined)) return 'sidebar';
      if (/main|content|body|article/.test(combined)) return 'main';

      parent = parent.parentElement;
    }

    return 'page';
  }
}
