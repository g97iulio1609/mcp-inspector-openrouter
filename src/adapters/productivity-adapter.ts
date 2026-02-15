/**
 * ProductivityAdapter — composite adapter for productivity platform detection
 * and interaction. Delegates to platform-specific adapters.
 */

import type { IProductivityPort, ProductivityPlatform } from '../ports/productivity.port';
import { NotionAdapter } from './notion-adapter';
import { GitHubAdapter } from './github-adapter';
import { GoogleDocsAdapter } from './google-docs-adapter';
import { TrelloAdapter } from './trello-adapter';
import { SlackAdapter } from './slack-adapter';

export class ProductivityAdapter implements IProductivityPort {
  readonly notion: NotionAdapter;
  readonly github: GitHubAdapter;
  readonly googleDocs: GoogleDocsAdapter;
  readonly trello: TrelloAdapter;
  readonly slack: SlackAdapter;

  constructor() {
    this.notion = new NotionAdapter();
    this.github = new GitHubAdapter();
    this.googleDocs = new GoogleDocsAdapter();
    this.trello = new TrelloAdapter();
    this.slack = new SlackAdapter();
  }

  detectPlatform(): ProductivityPlatform {
    if (this.notion.isOnNotion()) return 'notion';
    if (this.github.isOnGitHub()) return 'github';
    if (this.googleDocs.isOnGoogleDocs()) return 'google-docs';
    if (this.trello.isOnTrello()) return 'trello';
    if (this.slack.isOnSlack()) return 'slack';
    return 'unknown';
  }

  isProductivityApp(): boolean {
    return this.detectPlatform() !== 'unknown';
  }
}
