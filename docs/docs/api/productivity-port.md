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

```typescript
interface IGoogleDocsPort {
  openDocument(docId: string): Promise<void>;
  typeText(text: string): Promise<void>;
  formatSelection(format: 'bold' | 'italic' | 'underline' | 'heading'): Promise<void>;
  getDocumentText(): Promise<string>;
  insertImage(url: string): Promise<void>;
}
```

Document (title), editing (text, bold, italic, heading, link), comments (add, resolve), navigation (beginning, end, find/replace), sharing.

### ITrelloPort

```typescript
interface ITrelloPort {
  navigateToBoard(boardId: string): Promise<void>;
  createCard(listId: string, title: string, description?: string): Promise<void>;
  moveCard(cardId: string, targetListId: string): Promise<void>;
  archiveCard(cardId: string): Promise<void>;
  getBoardLists(): Promise<{ id: string; name: string }[]>;
}
```

Cards (create, move, archive, label, comment, assign, due date), lists (create, archive), board (search, filter by label/member).

### ISlackPort

```typescript
interface ISlackPort {
  navigateToChannel(channelName: string): Promise<void>;
  sendMessage(text: string): Promise<void>;
  searchMessages(query: string): Promise<void>;
  setStatus(emoji: string, text: string): Promise<void>;
  createChannel(name: string, isPrivate?: boolean): Promise<void>;
}
```

Messages (send, reply, react, edit, delete), channels (switch, search, create), status (set status, availability), files, navigation (threads, DMs, mentions).

## Adapters

Each platform has a dedicated DOM-based adapter:
- `NotionAdapter` — Notion keyboard shortcuts + DOM
- `GitHubAdapter` — GitHub-specific selectors
- `GoogleDocsAdapter` — Google Docs iframe + menu selectors; uses `openDocument`, `typeText`, `formatSelection`, `getDocumentText`, `insertImage`
- `TrelloAdapter` — Trello board/card selectors; uses `navigateToBoard`, `createCard`, `moveCard`, `archiveCard`, `getBoardLists`
- `SlackAdapter` — Slack webapp selectors; uses `navigateToChannel`, `sendMessage`, `searchMessages`, `setStatus`, `createChannel`
