---
sidebar_position: 7
---

# IToolCachePort

Persistent WebMCP tool manifest caching via IndexedDB.

## Interface

```typescript
interface IToolCachePort {
  get(site: string, urlPattern: string): Promise<CachedPage | null>;
  put(site: string, urlPattern: string, tools: CleanTool[]): Promise<void>;
  getManifest(site: string): Promise<SiteManifest | null>;
  diff(site: string, urlPattern: string, tools: CleanTool[]): Promise<ToolDiff>;
  applyDiff(site: string, urlPattern: string, diff: ToolDiff): Promise<void>;
  invalidate(site: string, urlPattern: string): Promise<void>;
  invalidateSite(site: string): Promise<void>;
  clear(): Promise<void>;
}
```

## Key Types

- **SiteManifest** — `{ site, version, lastFullScan, pages: Record<pattern, CachedPage> }`
- **CachedPage** — `{ pattern, tools, hash, scannedAt }`
- **ToolDiff** — `{ added, removed, changed }`

## Implementation: IndexedDBToolCacheAdapter

- Uses IndexedDB database `webmcp-tool-cache`, store `manifests`
- URL pattern matching via `urlToPattern()` (strips query values, sorts keys)
- djb2 hash over `name:confidence:description:JSON.stringify(inputSchema)`
- 24-hour default TTL (configurable)
- Single readwrite transactions for `put()` and `invalidate()` (TOCTOU-safe)

## Cache Flow

1. **Cache hit** → Return tools + populate `inferredToolsMap` + schedule background diff
2. **Cache miss** → Full DOM scan → store in cache
3. **Background diff** → Compare cached vs live tools → apply diff if changed
