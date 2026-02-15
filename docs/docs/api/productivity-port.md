---
sidebar_position: 11
---

# IProductivityPort

Composite port for productivity platform interactions.

## Interface

```typescript
type ProductivityPlatform = 'notion' | 'github' | 'google-docs' | 'trello' | 'slack' | 'unknown';

interface IProductivityPort {
  detectPlatform(): ProductivityPlatform;
  isProductivityApp(): boolean;
  notion: INotionPort;
  github: IGitHubPort;
  googleDocs: IGoogleDocsPort;
  trello: ITrelloPort;
  slack: ISlackPort;
}
```

## Sub-Ports

### INotionPort
Pages (create, duplicate, delete), blocks (add text/heading/todo/code), database (add row, filter, sort), navigation (search, go to page, toggle sidebar).

### IGitHubPort
Repository (star, fork), issues (create, close, reopen, comment, label), PRs (approve, request changes, merge), navigation, code (file view, permalink).

### IGoogleDocsPort
Document (title), editing (text, bold, italic, heading, link), comments (add, resolve), navigation (beginning, end, find/replace), sharing.

### ITrelloPort
Cards (create, move, archive, label, comment, assign, due date), lists (create, archive), board (search, filter by label/member).

### ISlackPort
Messages (send, reply, react, edit, delete), channels (switch, search, create), status (set status, availability), files, navigation (threads, DMs, mentions).

## Adapters

Each platform has a dedicated DOM-based adapter:
- `NotionAdapter` — Notion keyboard shortcuts + DOM
- `GitHubAdapter` — GitHub-specific selectors
- `GoogleDocsAdapter` — Google Docs iframe + menu selectors
- `TrelloAdapter` — Trello board/card selectors
- `SlackAdapter` — Slack webapp selectors
