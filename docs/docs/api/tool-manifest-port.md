---
sidebar_position: 12
---

# IToolManifestPort

Auto-generated MCP-compatible tool manifests from HTML semantics.

## Interface

```typescript
interface IToolManifestPort {
  getManifest(origin: string): SiteToolManifest | null;
  updatePage(origin: string, url: string, tools: CleanTool[]): SiteToolManifest;
  applyDiff(origin: string, url: string, added: CleanTool[], removed: string[]): SiteToolManifest;
  toMCPJson(origin: string): string;
  getToolsForUrl(origin: string, url: string): ManifestTool[];
}
```

## Key Types

```typescript
interface SiteToolManifest {
  origin: string;
  version: number;
  generatedAt: string;
  pages: Record<string, PageToolSet>;
  tools: ManifestTool[];
}

interface ManifestTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  pages: string[];
  annotations?: Record<string, unknown>;
}
```

## How It Works

1. **Tool Registry** scans the page and discovers tools from HTML
2. **ToolManifestAdapter** receives tools per URL, normalizes URL patterns
3. Cross-page deduplication merges tools seen on multiple pages
4. Volatile feed-level tools are filtered out (e.g. social actions, non-structural navigation links)
5. **Incremental diffs** update the manifest in background without full rescan
6. **`toMCPJson()`** exports MCP-compatible JSON for external consumption

## WebMCP Server

The manifest is exposed to the page via:
- `<script type="application/wmcp+json">` DOM element
- `CustomEvent('wmcp-request')` / `CustomEvent('wmcp-response')` protocol

## Persistence

Manifests are persisted to IndexedDB (`wmcp_manifests` store) and restored on page load for instant availability.

## Adapter

`ToolManifestAdapter` delegates to OneCrawl's `SemanticScrapingAdapter` for shared logic (URL pattern normalization, hashing, deduplication).
