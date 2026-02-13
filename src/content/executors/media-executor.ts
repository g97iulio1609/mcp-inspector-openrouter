/**
 * Media executor: unified media command execution through player adapters.
 */

import type { Tool } from '../../types';
import {
  NativePlayerAdapter,
  getPlayerRegistry,
  parseMediaToolName,
  type IVideoPlayer,
  type MediaToolAction,
  type ParsedMediaToolName,
} from '../media';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class MediaExecutor extends BaseExecutor {
  readonly category = 'media' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const actionTarget = this.parseTool(tool.name);
    if (!actionTarget) return this.fail('Unknown media action');

    const parsedArgs = this.parseArgs(args);
    const player = this.resolvePlayer(actionTarget.playerId, tool);
    if (!player) {
      return this.fail(`Media player not found: ${actionTarget.playerId}`);
    }

    try {
      return await this.executeAction(player, actionTarget.action, parsedArgs, tool.description);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.fail(`Media execution failed: ${message}`);
    }
  }

  private parseTool(toolName: string): ParsedMediaToolName | null {
    return parseMediaToolName(toolName) ?? this.parseLegacyToolName(toolName);
  }

  private parseLegacyToolName(toolName: string): ParsedMediaToolName | null {
    const patterns: ReadonlyArray<{ re: RegExp; action: MediaToolAction }> = [
      { re: /\.play-(?:audio-)?(.+)$/i, action: 'play' },
      { re: /\.pause-(.+)$/i, action: 'pause' },
      { re: /\.seek-(.+)$/i, action: 'seek' },
    ];

    for (const { re, action } of patterns) {
      const match = re.exec(toolName);
      if (!match || !match[1]) continue;
      return {
        action,
        playerId: match[1],
      };
    }

    return null;
  }

  private resolvePlayer(playerId: string, tool: Tool): IVideoPlayer | null {
    const registry = getPlayerRegistry();
    registry.refresh(document);

    const fromRegistry = registry.getById(playerId);
    if (fromRegistry) return fromRegistry;

    const el = this.findElement(tool);
    if (el instanceof HTMLMediaElement) {
      return new NativePlayerAdapter(playerId, el);
    }

    return null;
  }

  private async executeAction(
    player: IVideoPlayer,
    action: MediaToolAction,
    args: Record<string, unknown>,
    description: string,
  ): Promise<ExecutionResult> {
    switch (action) {
      case 'play': {
        await player.play();
        return this.ok(`Playing: ${description}`);
      }

      case 'pause': {
        await player.pause();
        return this.ok(`Paused: ${description}`);
      }

      case 'seek': {
        const time = this.toFiniteNumber(args.time, 'time');
        await player.seek(time);
        return this.ok(`Seeked to ${time}s: ${description}`);
      }

      case 'set-volume': {
        const level = this.toFiniteNumber(args.level, 'level');
        await player.setVolume(level);
        return this.ok(`Volume set to ${level}: ${description}`);
      }

      case 'mute': {
        await player.mute();
        return this.ok(`Muted: ${description}`);
      }

      case 'unmute': {
        await player.unmute();
        return this.ok(`Unmuted: ${description}`);
      }

      case 'get-state': {
        const state = await player.getState();
        return this.ok(`State retrieved: ${description}`, state);
      }

      case 'get-transcript': {
        const transcript = await this.extractTranscript(player);
        if (!transcript) {
          return this.fail('Transcript unavailable for current media context');
        }
        return this.ok(`Transcript retrieved: ${description}`, transcript);
      }

      case 'next-track': {
        if (!player.nextTrack) return this.fail('next-track not supported by this player');
        await player.nextTrack();
        return this.ok(`Moved to next track: ${description}`);
      }

      case 'previous-track': {
        if (!player.previousTrack) return this.fail('previous-track not supported by this player');
        await player.previousTrack();
        return this.ok(`Moved to previous track: ${description}`);
      }

      case 'shuffle': {
        if (!player.shuffle) return this.fail('shuffle not supported by this player');
        await player.shuffle();
        return this.ok(`Shuffle enabled: ${description}`);
      }

      default:
        return this.fail('Unknown media action');
    }
  }

  private toFiniteNumber(value: unknown, argName: string): number {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`Invalid ${argName} argument`);
    }
    return numberValue;
  }

  private async extractTranscript(
    player: IVideoPlayer,
  ): Promise<{ text: string; segments: string[] } | null> {
    if (player.platform !== 'youtube') return null;

    const readSegments = (): string[] => {
      const selectors = [
        'ytd-transcript-segment-renderer #segment-text',
        'ytd-transcript-segment-renderer .segment-text',
        'ytd-transcript-renderer #segments-container ytd-transcript-segment-renderer',
        '[data-testid*="transcript" i] [data-testid*="segment" i]',
        '[class*="transcript" i] [class*="segment" i]',
      ];

      const out: string[] = [];
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
        for (const node of nodes) {
          const text = (node.textContent ?? '').trim();
          if (text) out.push(text);
        }
      }

      return [...new Set(out)];
    };

    let segments = readSegments();
    if (segments.length === 0) {
      const openButtons = [
        'button[aria-label*="transcript" i]',
        'tp-yt-paper-button[aria-label*="transcript" i]',
        'button[aria-label*="show transcript" i]',
        'button[title*="transcript" i]',
      ];

      const btn = openButtons
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .find((el) => !!el);

      if (btn) {
        btn.click();
        await this.wait(300);
      }

      segments = readSegments();
    }

    if (segments.length === 0) return null;

    return {
      text: segments.join('\n'),
      segments,
    };
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
