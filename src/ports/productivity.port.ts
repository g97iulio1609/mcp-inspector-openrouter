/**
 * IProductivityPort — contract for productivity platform interactions.
 * Covers Notion, GitHub, Google Docs, and generic productivity tools.
 */

export type ProductivityPlatform = 'notion' | 'github' | 'google-docs' | 'trello' | 'slack' | 'unknown';

export interface INotionPort {
  isOnNotion(): boolean;

  // Pages
  createPage(title: string, parentId?: string): Promise<void>;
  duplicatePage(): Promise<void>;
  deletePage(): Promise<void>;

  // Blocks
  addBlock(type: 'text' | 'heading' | 'todo' | 'bullet' | 'code', content: string): Promise<void>;
  toggleTodo(): Promise<void>;

  // Database
  addDatabaseRow(): Promise<void>;
  filterDatabase(property: string, value: string): Promise<void>;
  sortDatabase(property: string, direction: 'asc' | 'desc'): Promise<void>;

  // Navigation
  searchPages(query: string): Promise<void>;
  goToPage(title: string): Promise<void>;
  toggleSidebar(): Promise<void>;
}

export interface IGitHubPort {
  isOnGitHub(): boolean;

  // Repository
  starRepo(): Promise<void>;
  unstarRepo(): Promise<void>;
  forkRepo(): Promise<void>;

  // Issues
  createIssue(title: string, body?: string): Promise<void>;
  closeIssue(): Promise<void>;
  reopenIssue(): Promise<void>;
  addComment(text: string): Promise<void>;
  addLabel(label: string): Promise<void>;

  // PRs
  approvePR(): Promise<void>;
  requestChanges(comment: string): Promise<void>;
  mergePR(): Promise<void>;

  // Navigation
  goToIssues(): Promise<void>;
  goToPullRequests(): Promise<void>;
  goToActions(): Promise<void>;
  searchRepo(query: string): Promise<void>;

  // Code
  toggleFileView(): Promise<void>;
  copyPermalink(): Promise<void>;
}

export interface IGoogleDocsPort {
  isOnGoogleDocs(): boolean;

  // Document
  getDocTitle(): string;
  setDocTitle(title: string): Promise<void>;
  insertText(text: string): Promise<void>;

  // Formatting
  formatBold(): Promise<void>;
  formatItalic(): Promise<void>;
  formatHeading(level: number): Promise<void>;
  insertLink(url: string): Promise<void>;

  // Comments
  addComment(text: string): Promise<void>;
  resolveComment(): Promise<void>;

  // Navigation
  goToBeginning(): Promise<void>;
  goToEnd(): Promise<void>;
  findAndReplace(find: string, replace: string): Promise<void>;

  // Sharing
  shareDoc(): Promise<void>;
  getShareLink(): string;
}

export interface ITrelloPort {
  isOnTrello(): boolean;

  // Cards
  createCard(title: string): Promise<void>;
  moveCard(listName: string): Promise<void>;
  archiveCard(): Promise<void>;
  addLabel(label: string): Promise<void>;
  addComment(text: string): Promise<void>;
  assignMember(member: string): Promise<void>;
  setDueDate(date: string): Promise<void>;

  // Lists
  createList(name: string): Promise<void>;
  archiveList(): Promise<void>;

  // Search & Filter
  searchCards(query: string): Promise<void>;
  filterByLabel(label: string): Promise<void>;
  filterByMember(member: string): Promise<void>;
}

export interface ISlackPort {
  isOnSlack(): boolean;

  // Messaging
  sendMessage(text: string): Promise<void>;
  replyInThread(text: string): Promise<void>;
  addReaction(emoji: string): Promise<void>;
  editLastMessage(): Promise<void>;
  deleteLastMessage(): Promise<void>;

  // Navigation
  switchChannel(channel: string): Promise<void>;
  searchMessages(query: string): Promise<void>;
  createChannel(name: string): Promise<void>;

  // Status
  setStatus(status: string): Promise<void>;
  setAvailability(available: boolean): Promise<void>;

  // Files & Views
  uploadFile(): Promise<void>;
  goToThreads(): Promise<void>;
  goToDMs(): Promise<void>;
  goToMentions(): Promise<void>;
}

export interface IProductivityPort {
  detectPlatform(): ProductivityPlatform;
  isProductivityApp(): boolean;
  notion: INotionPort;
  github: IGitHubPort;
  googleDocs: IGoogleDocsPort;
  trello: ITrelloPort;
  slack: ISlackPort;
}
