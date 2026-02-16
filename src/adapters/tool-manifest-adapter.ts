/**
 * ToolManifestAdapter — Thin wrapper around OneCrawl's SemanticScrapingAdapter.
 *
 * Adapts CleanTool (Chrome extension–specific) ↔ SemanticTool (generic)
 * while delegating all manifest logic to the shared OneCrawl implementation.
 */

import type {
  IToolManifestPort,
  SiteToolManifest,
  ManifestTool,
} from '../ports/tool-manifest.port';
import type { CleanTool } from '../types';
import {
  SemanticScrapingAdapter,
  type SemanticTool,
} from 'onegenui-deep-agents/scraping';

const VOLATILE_MANIFEST_CATEGORIES: ReadonlySet<Exclude<CleanTool['category'], undefined>> = new Set([
  'social-action',
]);

const STRUCTURAL_NAV_PREFIXES = [
  'nav.header.',
  'nav.nav.',
  'nav.sidebar.',
  'nav.footer.',
] as const;

function shouldApplyStructuralFiltering(tool: CleanTool): boolean {
  return tool._source === undefined || tool._source === 'inferred' || tool._source === 'manifest';
}

/** Convert a CleanTool to a SemanticTool for the shared adapter. */
function toSemanticTool(tool: CleanTool): SemanticTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: typeof tool.inputSchema === 'string'
      ? tool.inputSchema
      : { ...tool.inputSchema } as Record<string, unknown>,
    category: tool.category,
    annotations: tool.annotations
      ? { ...tool.annotations }
      : undefined,
  };
}

function isStructuralManifestTool(tool: CleanTool): boolean {
  if (!shouldApplyStructuralFiltering(tool)) {
    return true;
  }

  if (tool.category === 'navigation') {
    if (!tool.name.startsWith('nav.')) {
      return true;
    }
    return STRUCTURAL_NAV_PREFIXES.some(prefix => tool.name.startsWith(prefix));
  }

  return !tool.category || !VOLATILE_MANIFEST_CATEGORIES.has(tool.category);
}

export class ToolManifestAdapter implements IToolManifestPort {
  private readonly inner = new SemanticScrapingAdapter();

  getManifest(origin: string): SiteToolManifest | null {
    return this.inner.getManifest(origin);
  }

  updatePage(origin: string, url: string, tools: CleanTool[]): SiteToolManifest {
    return this.inner.updatePage(origin, url, tools.filter(isStructuralManifestTool).map(toSemanticTool));
  }

  applyDiff(origin: string, url: string, added: CleanTool[], removed: string[]): SiteToolManifest {
    return this.inner.applyDiff(
      origin,
      url,
      added.filter(isStructuralManifestTool).map(toSemanticTool),
      removed,
    );
  }

  toMCPJson(origin: string): string {
    return this.inner.toMCPJson(origin);
  }

  getToolsForUrl(origin: string, url: string): ManifestTool[] {
    return this.inner.getToolsForUrl(origin, url);
  }
}
