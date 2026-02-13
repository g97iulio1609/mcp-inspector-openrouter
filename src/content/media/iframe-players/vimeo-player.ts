import { BasePlayer } from '../base-player';
import type { PlayerCapabilities, PlayerState } from '../types';

interface VimeoSnapshot {
  currentTime?: number;
  duration?: number;
  volume?: number;
  paused?: boolean;
}

const VIMEO_ALLOWED_ORIGINS = new Set<string>(['https://player.vimeo.com']);

const VIMEO_CAPABILITIES: PlayerCapabilities = {
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

export class VimeoPlayer extends BasePlayer {
  readonly platform = 'vimeo' as const;
  readonly capabilities = VIMEO_CAPABILITIES;
  readonly anchorElement: Element;

  private readonly targetOrigin: string;
  private readonly snapshot: VimeoSnapshot = {};
  private disposed = false;
  private lastNonZeroVolume = 1;

  private readonly messageListener = (event: MessageEvent<unknown>): void => {
    if (this.disposed || event.source !== this.iframe.contentWindow) return;
    if (event.origin !== this.targetOrigin) return;

    const payload = this.parsePayload(event.data);
    if (!payload) return;

    const eventName = this.readString(payload.event);
    const methodName = this.readString(payload.method);
    const data = payload.data;
    const value = payload.value;

    if (eventName === 'play') this.snapshot.paused = false;
    if (eventName === 'pause') this.snapshot.paused = true;

    if (eventName === 'timeupdate' && typeof data === 'object' && data) {
      const record = data as Record<string, unknown>;
      if (typeof record.seconds === 'number') this.snapshot.currentTime = record.seconds;
      if (typeof record.duration === 'number') this.snapshot.duration = record.duration;
    }

    if (methodName === 'getCurrentTime' && typeof value === 'number') {
      this.snapshot.currentTime = value;
    }
    if (methodName === 'getDuration' && typeof value === 'number') {
      this.snapshot.duration = value;
    }
    if (methodName === 'getVolume' && typeof value === 'number') {
      this.snapshot.volume = value;
      if (value > 0) this.lastNonZeroVolume = value;
    }
    if (methodName === 'getPaused' && typeof value === 'boolean') {
      this.snapshot.paused = value;
    }
  };

  constructor(
    public readonly id: string,
    private readonly iframe: HTMLIFrameElement,
  ) {
    super(id, 'vimeo', VIMEO_CAPABILITIES);
    this.anchorElement = iframe;

    const origin = this.resolveTargetOrigin(iframe);
    if (!origin) {
      throw new Error('Invalid Vimeo iframe origin');
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
    this.postMethod('setCurrentTime', normalized);
  }

  async setVolume(level: number): Promise<void> {
    const normalized = this.clampVolume(level);
    this.postMethod('setVolume', normalized);
    this.snapshot.volume = normalized;
    if (normalized > 0) this.lastNonZeroVolume = normalized;
  }

  async mute(): Promise<void> {
    this.postMethod('setVolume', 0);
    this.snapshot.volume = 0;
  }

  async unmute(): Promise<void> {
    const restore = this.lastNonZeroVolume > 0 ? this.lastNonZeroVolume : 1;
    this.postMethod('setVolume', restore);
    this.snapshot.volume = restore;
  }

  async getState(): Promise<PlayerState> {
    this.postMethod('getCurrentTime');
    this.postMethod('getDuration');
    this.postMethod('getVolume');
    this.postMethod('getPaused');

    const volume = this.snapshot.volume ?? 1;

    return {
      currentTime: this.snapshot.currentTime ?? 0,
      duration: this.snapshot.duration ?? 0,
      paused: this.snapshot.paused ?? true,
      volume: this.clampVolume(volume),
      muted: volume === 0,
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

  private postMethod(method: string, value?: unknown): void {
    if (this.disposed) throw new Error('Player is disposed');
    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow) throw new Error('Vimeo iframe window unavailable');

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
      if (!VIMEO_ALLOWED_ORIGINS.has(url.origin)) return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }
}
