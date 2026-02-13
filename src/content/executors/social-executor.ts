/**
 * Social-action executor: like, share, follow, comment clicks.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class SocialExecutor extends BaseExecutor {
  readonly category = 'social-action' as const;

  async execute(tool: Tool): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLElement | null;
    if (!el) return this.fail('Social action element not found');

    el.click();

    const action = this.parseAction(tool.name);
    switch (action) {
      case 'like':
        return this.ok(`Liked/reacted: ${tool.description}`);
      case 'share':
        return this.ok(`Shared/reposted: ${tool.description}`);
      case 'follow':
        return this.ok(`Followed/subscribed: ${tool.description}`);
      case 'comment':
        return this.ok(`Opened comment/reply: ${tool.description}`);
      case 'message':
        return this.ok(`Opened message/chat action: ${tool.description}`);
      case 'save':
        return this.ok(`Saved/bookmarked: ${tool.description}`);
      case 'join':
        return this.ok(`Joined action executed: ${tool.description}`);
      default:
        return this.ok(`Social action executed: ${tool.name}`);
    }
  }

  private parseAction(name: string):
    | 'like'
    | 'share'
    | 'follow'
    | 'comment'
    | 'message'
    | 'save'
    | 'join'
    | null {
    const match = /^social\.([a-z-]+)-/i.exec(name);
    if (!match) return null;
    const action = match[1].toLowerCase();
    switch (action) {
      case 'like':
      case 'share':
      case 'follow':
      case 'comment':
      case 'message':
      case 'save':
      case 'join':
        return action;
      default:
        return null;
    }
  }
}
