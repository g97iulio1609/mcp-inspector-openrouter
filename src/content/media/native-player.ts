import { BasePlayer } from './base-player';
import type { PlayerCapabilities, PlayerState } from './types';

const NATIVE_CAPABILITIES: PlayerCapabilities = {
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

export class NativePlayerAdapter extends BasePlayer {
  readonly platform = 'native' as const;
  readonly capabilities = NATIVE_CAPABILITIES;

  constructor(
    public readonly id: string,
    private readonly mediaElement: HTMLMediaElement,
  ) {
    super(id, 'native', NATIVE_CAPABILITIES);
  }

  get anchorElement(): Element {
    return this.mediaElement;
  }

  async play(): Promise<void> {
    await this.mediaElement.play();
  }

  async pause(): Promise<void> {
    this.mediaElement.pause();
  }

  async seek(time: number): Promise<void> {
    const normalized = this.clampSeek(time, this.mediaElement.duration);
    this.mediaElement.currentTime = normalized;
  }

  async setVolume(level: number): Promise<void> {
    this.mediaElement.volume = this.clampVolume(level);
  }

  async mute(): Promise<void> {
    this.mediaElement.muted = true;
  }

  async unmute(): Promise<void> {
    this.mediaElement.muted = false;
  }

  async getState(): Promise<PlayerState> {
    return {
      currentTime: Number.isFinite(this.mediaElement.currentTime)
        ? this.mediaElement.currentTime
        : 0,
      duration: Number.isFinite(this.mediaElement.duration)
        ? this.mediaElement.duration
        : 0,
      paused: this.mediaElement.paused,
      volume: this.mediaElement.volume,
      muted: this.mediaElement.muted,
      playbackRate: this.mediaElement.playbackRate,
      title: this.readElementTitle(this.mediaElement),
      platform: this.platform,
      hasPlaylist: false,
    };
  }

  override isAlive(): boolean {
    return document.contains(this.mediaElement);
  }
}
