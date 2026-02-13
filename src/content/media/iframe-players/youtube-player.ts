import { BasePlayer } from '../base-player';
import type { PlayerCapabilities, PlayerState } from '../types';

interface YouTubeSnapshot {
  currentTime?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  playerState?: number;
}

const YOUTUBE_ALLOWED_ORIGINS = new Set<string>([
  'https://www.youtube.com',
  'https://youtube.com',
  'https://m.youtube.com',
  'https://www.youtube-nocookie.com',
]);

const YOUTUBE_CAPABILITIES: PlayerCapabilities = {
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

export class YouTubePlayer extends BasePlayer {
  readonly platform = 'youtube' as const;
  readonly capabilities = YOUTUBE_CAPABILITIES;
  readonly anchorElement: Element;

  private readonly targetOrigin: string;
  private readonly snapshot: YouTubeSnapshot = {};
  private disposed = false;

  private readonly messageListener = (event: MessageEvent<unknown>): void => {
    if (this.disposed || event.source !== this.iframe.contentWindow) return;
    if (event.origin !== this.targetOrigin) return;

    const payload = this.parsePayload(event.data);
    if (!payload) return;

    const eventType = payload.event;
    if (eventType !== 'infoDelivery') return;

    const info = payload.info;
    if (!info || typeof info !== 'object') return;

    const record = info as Record<string, unknown>;
    this.updateSnapshot(record);
  };

  constructor(
    public readonly id: string,
    private readonly iframe: HTMLIFrameElement,
  ) {
    super(id, 'youtube', YOUTUBE_CAPABILITIES);
    this.anchorElement = iframe;

    const origin = this.resolveTargetOrigin(iframe);
    if (!origin) {
      throw new Error('Invalid YouTube iframe origin');
    }
    this.targetOrigin = origin;

    window.addEventListener('message', this.messageListener);
    this.bootstrap();
  }

  async play(): Promise<void> {
    this.postCommand('playVideo');
  }

  async pause(): Promise<void> {
    this.postCommand('pauseVideo');
  }

  async seek(time: number): Promise<void> {
    const normalized = this.clampSeek(time, this.snapshot.duration ?? Number.NaN);
    this.postCommand('seekTo', [normalized, true]);
  }

  async setVolume(level: number): Promise<void> {
    const normalized = this.clampVolume(level);
    this.postCommand('setVolume', [Math.round(normalized * 100)]);
  }

  async mute(): Promise<void> {
    this.postCommand('mute');
  }

  async unmute(): Promise<void> {
    this.postCommand('unMute');
  }

  async nextTrack(): Promise<void> {
    this.postCommand('nextVideo');
  }

  async previousTrack(): Promise<void> {
    this.postCommand('previousVideo');
  }

  async shuffle(): Promise<void> {
    this.postCommand('setShuffle', [true]);
  }

  async getState(): Promise<PlayerState> {
    // Ask for fresh info; if API isn't enabled, we still return best-effort snapshot.
    this.postCommand('getCurrentTime');
    this.postCommand('getDuration');
    this.postCommand('getVolume');
    this.postCommand('isMuted');
    this.postCommand('getPlaybackRate');
    this.postCommand('getPlayerState');

    const rawVolume = this.snapshot.volume ?? 100;
    const normalizedVolume = rawVolume > 1 ? rawVolume / 100 : rawVolume;
    const playerState = this.snapshot.playerState;

    return {
      currentTime: this.snapshot.currentTime ?? 0,
      duration: this.snapshot.duration ?? 0,
      paused: playerState !== 1,
      volume: this.clampVolume(normalizedVolume),
      muted: this.snapshot.muted ?? false,
      playbackRate: this.snapshot.playbackRate ?? 1,
      title: this.readElementTitle(this.iframe),
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

  private bootstrap(): void {
    this.postRaw({ event: 'listening', id: this.id, channel: 'widget' });
    this.postCommand('addEventListener', ['onStateChange']);
    this.postCommand('addEventListener', ['onPlaybackRateChange']);
  }

  private postCommand(func: string, args: readonly unknown[] = []): void {
    this.postRaw({ event: 'command', func, args });
  }

  private postRaw(payload: Record<string, unknown>): void {
    if (this.disposed) {
      throw new Error('Player is disposed');
    }

    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow) {
      throw new Error('YouTube iframe window unavailable');
    }

    targetWindow.postMessage(JSON.stringify(payload), this.targetOrigin);
  }

  private parsePayload(data: unknown): Record<string, unknown> | null {
    if (!data) return null;

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    if (typeof data === 'object') {
      return data as Record<string, unknown>;
    }

    return null;
  }

  private updateSnapshot(info: Record<string, unknown>): void {
    const currentTime = info.currentTime;
    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      this.snapshot.currentTime = currentTime;
    }

    const duration = info.duration;
    if (typeof duration === 'number' && Number.isFinite(duration)) {
      this.snapshot.duration = duration;
    }

    const volume = info.volume;
    if (typeof volume === 'number' && Number.isFinite(volume)) {
      this.snapshot.volume = volume;
    }

    const muted = info.muted;
    if (typeof muted === 'boolean') {
      this.snapshot.muted = muted;
    } else if (typeof muted === 'number') {
      this.snapshot.muted = muted === 1;
    }

    const playbackRate = info.playbackRate;
    if (typeof playbackRate === 'number' && Number.isFinite(playbackRate)) {
      this.snapshot.playbackRate = playbackRate;
    }

    const playerState = info.playerState;
    if (typeof playerState === 'number' && Number.isFinite(playerState)) {
      this.snapshot.playerState = playerState;
    }
  }

  private resolveTargetOrigin(iframe: HTMLIFrameElement): string | null {
    const src = iframe.getAttribute('src');
    if (!src) return null;

    try {
      const url = new URL(src, location.href);
      if (!YOUTUBE_ALLOWED_ORIGINS.has(url.origin)) {
        return null;
      }
      return url.origin;
    } catch {
      return null;
    }
  }
}
