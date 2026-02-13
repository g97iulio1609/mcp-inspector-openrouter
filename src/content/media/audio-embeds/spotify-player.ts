import { BasePlayer } from '../base-player';
import type { PlayerCapabilities, PlayerState } from '../types';

interface SpotifySnapshot {
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  volume?: number;
  muted?: boolean;
  title?: string;
  playlistIndex?: number;
  playlistLength?: number;
}

const SPOTIFY_ALLOWED_ORIGINS = new Set<string>(['https://open.spotify.com']);

const SPOTIFY_CAPABILITIES: PlayerCapabilities = {
  play: true,
  pause: true,
  seek: true,
  setVolume: true,
  mute: true,
  unmute: true,
  getState: true,
  nextTrack: true,
  previousTrack: true,
  shuffle: true,
};

export class SpotifyPlayer extends BasePlayer {
  readonly platform = 'spotify' as const;
  readonly capabilities = SPOTIFY_CAPABILITIES;
  readonly anchorElement: Element;

  private readonly targetOrigin: string;
  private readonly snapshot: SpotifySnapshot = {};
  private disposed = false;
  private lastNonZeroVolume = 1;

  private readonly messageListener = (event: MessageEvent<unknown>): void => {
    if (this.disposed || event.source !== this.iframe.contentWindow) return;
    if (event.origin !== this.targetOrigin) return;

    const payload = this.parsePayload(event.data);
    if (!payload) return;

    const data = payload.data;
    if (!data || typeof data !== 'object') return;

    const record = data as Record<string, unknown>;
    if (typeof record.position === 'number') this.snapshot.currentTime = record.position / 1000;
    if (typeof record.duration === 'number') this.snapshot.duration = record.duration / 1000;
    if (typeof record.paused === 'boolean') this.snapshot.paused = record.paused;
    if (typeof record.volume === 'number') {
      const normalized = record.volume > 1 ? record.volume / 100 : record.volume;
      this.snapshot.volume = this.clampVolume(normalized);
      if (this.snapshot.volume > 0) this.lastNonZeroVolume = this.snapshot.volume;
    }
    if (typeof record.muted === 'boolean') this.snapshot.muted = record.muted;
    if (typeof record.title === 'string') this.snapshot.title = record.title;
    if (typeof record.trackIndex === 'number') this.snapshot.playlistIndex = record.trackIndex;
    if (typeof record.trackCount === 'number') this.snapshot.playlistLength = record.trackCount;
  };

  constructor(
    public readonly id: string,
    private readonly iframe: HTMLIFrameElement,
  ) {
    super(id, 'spotify', SPOTIFY_CAPABILITIES);
    this.anchorElement = iframe;

    const origin = this.resolveTargetOrigin(iframe);
    if (!origin) {
      throw new Error('Invalid Spotify iframe origin');
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
    this.postCommand('seek', { positionMs: Math.round(normalized * 1000) });
  }

  async setVolume(level: number): Promise<void> {
    const normalized = this.clampVolume(level);
    this.postCommand('setVolume', { volume: normalized });
    this.snapshot.volume = normalized;
    if (normalized > 0) this.lastNonZeroVolume = normalized;
  }

  async mute(): Promise<void> {
    this.postCommand('setMuted', { muted: true });
    this.snapshot.muted = true;
    this.snapshot.volume = 0;
  }

  async unmute(): Promise<void> {
    this.postCommand('setMuted', { muted: false });
    this.snapshot.muted = false;
    if ((this.snapshot.volume ?? 0) === 0) {
      const restore = this.lastNonZeroVolume > 0 ? this.lastNonZeroVolume : 1;
      this.postCommand('setVolume', { volume: restore });
      this.snapshot.volume = restore;
    }
  }

  async nextTrack(): Promise<void> {
    this.postCommand('next');
  }

  async previousTrack(): Promise<void> {
    this.postCommand('previous');
  }

  async shuffle(): Promise<void> {
    this.postCommand('toggleShuffle', { enabled: true });
  }

  async getState(): Promise<PlayerState> {
    this.postCommand('getState');

    const volume = this.snapshot.volume ?? 1;
    const muted = this.snapshot.muted ?? volume === 0;

    return {
      currentTime: this.snapshot.currentTime ?? 0,
      duration: this.snapshot.duration ?? 0,
      paused: this.snapshot.paused ?? true,
      volume,
      muted,
      playbackRate: 1,
      title: this.snapshot.title ?? this.readElementTitle(this.iframe),
      platform: this.platform,
      hasPlaylist: true,
      playlistIndex: this.snapshot.playlistIndex,
      playlistLength: this.snapshot.playlistLength,
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
    if (!targetWindow) throw new Error('Spotify iframe window unavailable');

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
      if (!SPOTIFY_ALLOWED_ORIGINS.has(url.origin)) return null;
      return url.origin;
    } catch {
      return null;
    }
  }
}
