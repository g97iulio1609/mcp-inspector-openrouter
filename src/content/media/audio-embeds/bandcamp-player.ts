import { BasePlayer } from '../base-player';
import type { PlayerCapabilities, PlayerState } from '../types';

interface BandcampSnapshot {
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  volume?: number;
  title?: string;
}

const BANDCAMP_ALLOWED_ORIGINS = new Set<string>([
  'https://bandcamp.com',
  'https://www.bandcamp.com',
]);

const BANDCAMP_CAPABILITIES: PlayerCapabilities = {
  play: true,
  pause: true,
  seek: false,
  setVolume: true,
  mute: true,
  unmute: true,
  getState: true,
  nextTrack: false,
  previousTrack: false,
  shuffle: false,
};

export class BandcampPlayer extends BasePlayer {
  readonly platform = 'bandcamp' as const;
  readonly capabilities = BANDCAMP_CAPABILITIES;
  readonly anchorElement: Element;

  private readonly targetOrigin: string;
  private readonly snapshot: BandcampSnapshot = {};
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
    if (!data || typeof data !== 'object') return;
    const record = data as Record<string, unknown>;
    if (typeof record.currentTime === 'number') this.snapshot.currentTime = record.currentTime;
    if (typeof record.duration === 'number') this.snapshot.duration = record.duration;
    if (typeof record.volume === 'number') {
      const normalized = record.volume > 1 ? record.volume / 100 : record.volume;
      this.snapshot.volume = this.clampVolume(normalized);
      if (this.snapshot.volume > 0) this.lastNonZeroVolume = this.snapshot.volume;
    }
    if (typeof record.title === 'string') this.snapshot.title = record.title;
  };

  constructor(
    public readonly id: string,
    private readonly iframe: HTMLIFrameElement,
  ) {
    super(id, 'bandcamp', BANDCAMP_CAPABILITIES);
    this.anchorElement = iframe;

    const origin = this.resolveTargetOrigin(iframe);
    if (!origin) {
      throw new Error('Invalid Bandcamp iframe origin');
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

  async seek(_time: number): Promise<void> {
    throw new Error('Bandcamp seek is not supported');
  }

  async setVolume(level: number): Promise<void> {
    const normalized = this.clampVolume(level);
    this.postCommand('setVolume', { volume: normalized });
    this.snapshot.volume = normalized;
    if (normalized > 0) this.lastNonZeroVolume = normalized;
  }

  async mute(): Promise<void> {
    this.postCommand('setVolume', { volume: 0 });
    this.snapshot.volume = 0;
  }

  async unmute(): Promise<void> {
    const restore = this.lastNonZeroVolume > 0 ? this.lastNonZeroVolume : 1;
    this.postCommand('setVolume', { volume: restore });
    this.snapshot.volume = restore;
  }

  async getState(): Promise<PlayerState> {
    this.postCommand('getState');

    const volume = this.snapshot.volume ?? 1;

    return {
      currentTime: this.snapshot.currentTime ?? 0,
      duration: this.snapshot.duration ?? 0,
      paused: this.snapshot.paused ?? true,
      volume,
      muted: volume === 0,
      playbackRate: 1,
      title: this.snapshot.title ?? this.readElementTitle(this.iframe),
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

  private postCommand(command: string, payload?: Record<string, unknown>): void {
    if (this.disposed) throw new Error('Player is disposed');
    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow) throw new Error('Bandcamp iframe window unavailable');

    targetWindow.postMessage({ command, ...(payload ?? {}) }, this.targetOrigin);
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
      if (!BANDCAMP_ALLOWED_ORIGINS.has(url.origin)) return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }
}
