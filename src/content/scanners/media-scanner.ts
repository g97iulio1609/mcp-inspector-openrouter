/**
 * Media Scanner — unified semantic media tool discovery.
 */

import type { Tool, ToolAnnotations, ToolInputSchema } from '../../types';
import {
  CORE_MEDIA_ACTIONS,
  PLAYLIST_MEDIA_ACTIONS,
  getPlayerRegistry,
  type IVideoPlayer,
  type MediaToolAction,
} from '../media';
import { BaseScanner } from './base-scanner';

export class MediaScanner extends BaseScanner {
  readonly category = 'media' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const registry = getPlayerRegistry();
    const players = registry.refresh(root);
    const tools: Tool[] = [];

    for (const player of players) {
      for (const action of CORE_MEDIA_ACTIONS) {
        if (!this.supportsAction(player, action)) continue;
        tools.push(this.createMediaTool(player, action));
      }

      for (const action of PLAYLIST_MEDIA_ACTIONS) {
        if (!this.supportsAction(player, action)) continue;
        tools.push(this.createMediaTool(player, action));
      }
    }

    return tools;
  }

  private createMediaTool(player: IVideoPlayer, action: MediaToolAction): Tool {
    const label = this.getPlayerLabel(player);
    const { description, title } = this.getActionText(action, label);
    const schema = this.getActionSchema(action);
    const confidence = player.platform === 'youtube' ? 0.95 : 0.9;

    return this.createTool(
      `media.${action}.${player.id}`,
      description,
      player.anchorElement,
      schema,
      confidence,
      {
        title,
        annotations: this.getActionAnnotations(action),
      },
    );
  }

  private getPlayerLabel(player: IVideoPlayer): string {
    const anchor = player.anchorElement;
    const explicit = anchor ? this.getLabel(anchor) : '';
    const readableId = player.id.replace(/-/g, ' ').trim();
    return explicit || readableId || player.platform;
  }

  private getActionSchema(action: MediaToolAction): ToolInputSchema {
    if (action === 'seek') {
      return this.makeInputSchema([
        { name: 'time', type: 'number', description: 'Time in seconds', required: true },
      ]);
    }

    if (action === 'set-volume') {
      return this.makeInputSchema([
        { name: 'level', type: 'number', description: 'Volume from 0.0 to 1.0', required: true },
      ]);
    }

    return this.makeInputSchema([]);
  }

  private getActionAnnotations(action: MediaToolAction): ToolAnnotations {
    if (action === 'get-state' || action === 'get-transcript') {
      return this.makeAnnotations({ readOnly: true, idempotent: true });
    }

    const idempotent = action === 'pause' || action === 'mute' || action === 'unmute';
    return this.makeAnnotations({ readOnly: false, idempotent });
  }

  private getActionText(action: MediaToolAction, label: string): { description: string; title: string } {
    const map: Record<MediaToolAction, { description: string; title: string }> = {
      play: {
        description: `Play media: ${label}`,
        title: `Play: ${label}`,
      },
      pause: {
        description: `Pause media: ${label}`,
        title: `Pause: ${label}`,
      },
      seek: {
        description: `Seek media timeline: ${label}`,
        title: `Seek: ${label}`,
      },
      'set-volume': {
        description: `Set media volume: ${label}`,
        title: `Set volume: ${label}`,
      },
      mute: {
        description: `Mute media: ${label}`,
        title: `Mute: ${label}`,
      },
      unmute: {
        description: `Unmute media: ${label}`,
        title: `Unmute: ${label}`,
      },
      'get-state': {
        description: `Get media state: ${label}`,
        title: `Get state: ${label}`,
      },
      'get-transcript': {
        description: `Get media transcript: ${label}`,
        title: `Get transcript: ${label}`,
      },
      'next-track': {
        description: `Next track: ${label}`,
        title: `Next track: ${label}`,
      },
      'previous-track': {
        description: `Previous track: ${label}`,
        title: `Previous track: ${label}`,
      },
      shuffle: {
        description: `Shuffle playlist: ${label}`,
        title: `Shuffle: ${label}`,
      },
    };

    return map[action];
  }

  private supportsAction(player: IVideoPlayer, action: MediaToolAction): boolean {
    switch (action) {
      case 'play':
        return player.capabilities.play;
      case 'pause':
        return player.capabilities.pause;
      case 'seek':
        return player.capabilities.seek;
      case 'set-volume':
        return player.capabilities.setVolume;
      case 'mute':
        return player.capabilities.mute;
      case 'unmute':
        return player.capabilities.unmute;
      case 'get-state':
        return player.capabilities.getState;
      case 'get-transcript':
        return player.platform === 'youtube';
      case 'next-track':
        return player.capabilities.nextTrack;
      case 'previous-track':
        return player.capabilities.previousTrack;
      case 'shuffle':
        return player.capabilities.shuffle;
      default:
        return false;
    }
  }
}
