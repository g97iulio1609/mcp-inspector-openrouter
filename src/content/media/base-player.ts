import type {
  IVideoPlayer,
  PlayerCapabilities,
  PlayerPlatform,
  PlayerState,
} from './types';

export abstract class BasePlayer implements IVideoPlayer {
  abstract readonly anchorElement: Element | null;

  constructor(
    public readonly id: string,
    public readonly platform: PlayerPlatform,
    public readonly capabilities: PlayerCapabilities,
  ) {}

  abstract play(): Promise<void>;
  abstract pause(): Promise<void>;
  abstract seek(time: number): Promise<void>;
  abstract setVolume(level: number): Promise<void>;
  abstract mute(): Promise<void>;
  abstract unmute(): Promise<void>;
  abstract getState(): Promise<PlayerState>;

  async nextTrack(): Promise<void> {
    throw new Error(`nextTrack not supported for platform "${this.platform}"`);
  }

  async previousTrack(): Promise<void> {
    throw new Error(`previousTrack not supported for platform "${this.platform}"`);
  }

  async shuffle(): Promise<void> {
    throw new Error(`shuffle not supported for platform "${this.platform}"`);
  }

  isAlive(): boolean {
    return this.anchorElement ? document.contains(this.anchorElement) : true;
  }

  dispose(): void {
    // no-op by default
  }

  protected clampVolume(level: number): number {
    if (!Number.isFinite(level)) return 1;
    return Math.min(1, Math.max(0, level));
  }

  protected clampSeek(time: number, duration: number): number {
    const normalized = Number.isFinite(time) ? Math.max(0, time) : 0;
    if (!Number.isFinite(duration) || duration <= 0) return normalized;
    return Math.min(normalized, duration);
  }

  protected readElementTitle(el: Element | null): string {
    if (!el) return '';
    const attrTitle = el.getAttribute('title');
    if (attrTitle) return attrTitle.trim();
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    return '';
  }
}
