---
sidebar_position: 8
---

# ICrawlerPort

Semantic BFS site crawler for tool discovery across pages.

## Interface

```typescript
interface ICrawlerPort {
  crawl(target: CrawlTarget, onProgress?: (p: CrawlProgress) => void): Promise<CrawlResult>;
  cancel(): void;
  isRunning(): boolean;
}
```

## Key Types

```typescript
interface CrawlTarget {
  site: string;
  entryPoints: string[];
  maxPages?: number;      // default: 50
  maxDepth?: number;      // default: 3
  includePatterns?: string[];
  excludePatterns?: string[];
}

interface CrawlProgress {
  pagesScanned: number;
  pagesTotal: number;
  currentUrl: string;
  toolsFound: number;
  errors: number;
}

interface CrawlResult {
  site: string;
  pagesScanned: number;
  toolsDiscovered: number;
  duration: number;
  errors: string[];
}
```

## Implementation: SemanticCrawlerAdapter

- BFS crawl using `fetch()` + `DOMParser`
- Extracts tools from forms, buttons, links via `extractToolsFromHTML()`
- Integrates with `IToolCachePort` for persistent storage
- `globToRegex()`: split-based conversion (no sentinel, ReDoS-safe)
- Origin-based same-site check (SSRF-safe)
- Abort signal support with graceful cancellation
