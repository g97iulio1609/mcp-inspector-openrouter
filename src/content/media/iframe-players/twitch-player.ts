import { BasePlayer } from '../base-player';
import type { PlayerCapabilities, PlayerState } from '../types';

interface TwitchSnapshot {
  currentTime?: number;
  duration?: number;
  volume?: number;
  paused?: boolean;
  muted?: boolean;
}

const TWITCH_ALLOWED_ORIGINS = new Set<string>([
  'https://player.twitch.tv',
  'https://www.twitch.tv',
]);

const TWITCH_CAPABILITIES: PlayerCapabilities = {
  play: true,
  pause: true,
  seek: true,
  setVolume: true,
  mute: true,
  unmute: true,
  getState: true,
  nextTrack: false,
  previousTrack: false,
  shuffle: false,
};

export class TwitchPlayer extends BasePlayer {
  readonly platform = 'twitch' as const;
  readonly capabilities = TWITCH_CAPABILITIES;
  readonly anchorElement: Element;

  private readonly targetOrigin: string;
  private readonly snapshot: TwitchSnapshot = {};
  private disposed = false;
  private lastNonZeroVolume = 1;

  private readonly messageListener = (event: MessageEvent<unknown>): void => {
    if (this.disposed || event.source !== this.iframe.contentWindow) return;
    if (event.origin !== this.targetOrigin) return;

    const payload = this.parsePayload(event.data);
    if (!payload) return;

    const eventName = this.readString(payload.event);
    if (eventName === 'play') this.snapshot.paused = false;
    if (eventName === 'pause') this.snapshot.paused = true;

    const data = payload.data;
    if (typeof data !== 'object' || !data) return;

    const record = data as Record<string, unknown>;
    if (typeof record.currentTime === 'number') this.snapshot.currentTime = record.currentTime;
    if (typeof record.duration === 'number') this.snapshot.duration = record.duration;
    if (typeof record.volume === 'number') {
      this.snapshot.volume = record.volume;
      if (record.volume > 0) this.lastNonZeroVolume = record.volume;
    }
    if (typeof record.muted === 'boolean') this.snapshot.muted = record.muted;
    if (typeof record.paused === 'boolean') this.snapshot.paused = record.paused;
  };

  constructor(
    public readonly id: string,
    private readonly iframe: HTMLIFrameElement,
  ) {
    super(id, 'twitch', TWITCH_CAPABILITIES);
    this.anchorElement = iframe;

    const origin = this.resolveTargetOrigin(iframe);
    if (!origin) {
      throw new Error('Invalid Twitch iframe origin');
    }
    this.targetOrigin = origin;

    window.addEventListener('message', this.messageListener);
  }

  async play(): Promise<void> {
    this.postCommand('play');
  }

  async pause(): Promise<void> {
    this.postCommand('pause');
  }

  async seek(time: number): Promise<void> {
    const normalized = this.clampSeek(time, this.snapshot.duration ?? Number.NaN);
    this.postCommand('seek', [normalized]);
  }

  async setVolume(level: number): Promise<void> {
    const normalized = this.clampVolume(level);
    this.postCommand('setVolume', [normalized]);
    this.snapshot.volume = normalized;
    if (normalized > 0) this.lastNonZeroVolume = normalized;
  }

  async mute(): Promise<void> {
    this.postCommand('setMuted', [true]);
    this.snapshot.muted = true;
    this.snapshot.volume = 0;
  }

  async unmute(): Promise<void> {
    this.postCommand('setMuted', [false]);
    this.snapshot.muted = false;
    if ((this.snapshot.volume ?? 0) === 0) {
      const restore = this.lastNonZeroVolume > 0 ? this.lastNonZeroVolume : 1;
      this.postCommand('setVolume', [restore]);
      this.snapshot.volume = restore;
    }
  }

  async getState(): Promise<PlayerState> {
    this.postCommand('getState');

    const volume = this.snapshot.volume ?? 1;
    const muted = this.snapshot.muted ?? volume === 0;

    return {
      currentTime: this.snapshot.currentTime ?? 0,
      duration: this.snapshot.duration ?? 0,
      paused: this.snapshot.paused ?? true,
      volume: this.clampVolume(volume),
      muted,
      playbackRate: 1,
      title: this.readElementTitle(this.iframe),
      platform: this.platform,
      hasPlaylist: false,
    };
  }

  override isAlive(): boolean {
    return !this.disposed && document.contains(this.iframe);
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('message', this.messageListener);
  }

  private postCommand(command: string, args: readonly unknown[] = []): void {
    if (this.disposed) throw new Error('Player is disposed');
    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow) throw new Error('Twitch iframe window unavailable');

    targetWindow.postMessage({ command, args }, this.targetOrigin);
  }

  private parsePayload(data: unknown): Record<string, unknown> | null {
    if (!data) return null;
    if (typeof data === 'object') return data as Record<string, unknown>;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as unknown;
        return typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  private resolveTargetOrigin(iframe: HTMLIFrameElement): string | null {
    const src = iframe.getAttribute('src');
    if (!src) return null;

    try {
      const url = new URL(src, location.href);
      if (!TWITCH_ALLOWED_ORIGINS.has(url.origin)) return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }
}
