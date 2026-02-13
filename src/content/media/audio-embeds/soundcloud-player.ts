import { BasePlayer } from '../base-player';
import type { PlayerCapabilities, PlayerState } from '../types';

interface SoundCloudSnapshot {
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  volume?: number;
  title?: string;
}

const SOUNDCLOUD_ALLOWED_ORIGINS = new Set<string>(['https://w.soundcloud.com']);

const SOUNDCLOUD_CAPABILITIES: PlayerCapabilities = {
  play: true,
  pause: true,
  seek: true,
  setVolume: true,
  mute: true,
  unmute: true,
  getState: true,
  nextTrack: true,
  previousTrack: true,
  shuffle: false,
};

export class SoundCloudPlayer extends BasePlayer {
  readonly platform = 'soundcloud' as const;
  readonly capabilities = SOUNDCLOUD_CAPABILITIES;
  readonly anchorElement: Element;

  private readonly targetOrigin: string;
  private readonly snapshot: SoundCloudSnapshot = {};
  private disposed = false;
  private lastNonZeroVolume = 1;

  private readonly messageListener = (event: MessageEvent<unknown>): void => {
    if (this.disposed || event.source !== this.iframe.contentWindow) return;
    if (event.origin !== this.targetOrigin) return;

    const payload = this.parsePayload(event.data);
    if (!payload) return;

    const method = this.readString(payload.method);
    const value = payload.value;
    const eventName = this.readString(payload.event);

    if (eventName === 'play') this.snapshot.paused = false;
    if (eventName === 'pause') this.snapshot.paused = true;

    if (method === 'getPosition' && typeof value === 'number') {
      this.snapshot.currentTime = value / 1000;
    }
    if (method === 'getDuration' && typeof value === 'number') {
      this.snapshot.duration = value / 1000;
    }
    if (method === 'getVolume' && typeof value === 'number') {
      const normalized = value > 1 ? value / 100 : value;
      this.snapshot.volume = this.clampVolume(normalized);
      if (this.snapshot.volume > 0) this.lastNonZeroVolume = this.snapshot.volume;
    }
    if (method === 'getCurrentSound' && typeof value === 'object' && value) {
      const title = (value as Record<string, unknown>).title;
      if (typeof title === 'string') this.snapshot.title = title;
    }
  };

  constructor(
    public readonly id: string,
    private readonly iframe: HTMLIFrameElement,
  ) {
    super(id, 'soundcloud', SOUNDCLOUD_CAPABILITIES);
    this.anchorElement = iframe;

    const origin = this.resolveTargetOrigin(iframe);
    if (!origin) {
      throw new Error('Invalid SoundCloud iframe origin');
    }
    this.targetOrigin = origin;

    window.addEventListener('message', this.messageListener);
  }

  async play(): Promise<void> {
    this.postMethod('play');
  }

  async pause(): Promise<void> {
    this.postMethod('pause');
  }

  async seek(time: number): Promise<void> {
    const normalized = this.clampSeek(time, this.snapshot.duration ?? Number.NaN);
    this.postMethod('seekTo', Math.round(normalized * 1000));
  }

  async setVolume(level: number): Promise<void> {
    const normalized = this.clampVolume(level);
    this.postMethod('setVolume', Math.round(normalized * 100));
    this.snapshot.volume = normalized;
    if (normalized > 0) this.lastNonZeroVolume = normalized;
  }

  async mute(): Promise<void> {
    this.postMethod('setVolume', 0);
    this.snapshot.volume = 0;
  }

  async unmute(): Promise<void> {
    const restore = this.lastNonZeroVolume > 0 ? this.lastNonZeroVolume : 1;
    this.postMethod('setVolume', Math.round(restore * 100));
    this.snapshot.volume = restore;
  }

  async nextTrack(): Promise<void> {
    this.postMethod('next');
  }

  async previousTrack(): Promise<void> {
    this.postMethod('prev');
  }

  async getState(): Promise<PlayerState> {
    this.postMethod('getPosition');
    this.postMethod('getDuration');
    this.postMethod('getVolume');
    this.postMethod('getCurrentSound');

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
      hasPlaylist: true,
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

  private postMethod(method: string, value?: unknown): void {
    if (this.disposed) throw new Error('Player is disposed');
    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow) throw new Error('SoundCloud iframe window unavailable');

    const payload = value === undefined ? { method } : { method, value };
    targetWindow.postMessage(payload, this.targetOrigin);
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
      if (!SOUNDCLOUD_ALLOWED_ORIGINS.has(url.origin)) return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }
}
