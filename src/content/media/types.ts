export type PlayerPlatform =
  | 'native'
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'twitch'
  | 'videojs'
  | 'plyr'
  | 'jwplayer'
  | 'mediaelement'
  | 'spotify'
  | 'soundcloud'
  | 'bandcamp';

export interface PlayerCapabilities {
  readonly play: boolean;
  readonly pause: boolean;
  readonly seek: boolean;
  readonly setVolume: boolean;
  readonly mute: boolean;
  readonly unmute: boolean;
  readonly getState: boolean;
  readonly nextTrack: boolean;
  readonly previousTrack: boolean;
  readonly shuffle: boolean;
}

export interface PlayerState {
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  title: string;
  platform: PlayerPlatform;
  hasPlaylist: boolean;
  playlistIndex?: number;
  playlistLength?: number;
}

export type MediaToolAction =
  | 'play'
  | 'pause'
  | 'seek'
  | 'set-volume'
  | 'mute'
  | 'unmute'
  | 'get-state'
  | 'next-track'
  | 'previous-track'
  | 'shuffle';

export const CORE_MEDIA_ACTIONS: readonly MediaToolAction[] = [
  'play',
  'pause',
  'seek',
  'set-volume',
  'mute',
  'unmute',
  'get-state',
] as const;

export const PLAYLIST_MEDIA_ACTIONS: readonly MediaToolAction[] = [
  'next-track',
  'previous-track',
  'shuffle',
] as const;

export interface ParsedMediaToolName {
  readonly action: MediaToolAction;
  readonly playerId: string;
}

export interface IVideoPlayer {
  readonly id: string;
  readonly platform: PlayerPlatform;
  readonly capabilities: PlayerCapabilities;
  readonly anchorElement: Element | null;

  play(): Promise<void>;
  pause(): Promise<void>;
  seek(time: number): Promise<void>;
  setVolume(level: number): Promise<void>;
  mute(): Promise<void>;
  unmute(): Promise<void>;
  getState(): Promise<PlayerState>;

  nextTrack?(): Promise<void>;
  previousTrack?(): Promise<void>;
  shuffle?(): Promise<void>;

  isAlive(): boolean;
  dispose(): void;
}

const ACTION_SET = new Set<MediaToolAction>([
  ...CORE_MEDIA_ACTIONS,
  ...PLAYLIST_MEDIA_ACTIONS,
]);

export function parseMediaToolName(name: string): ParsedMediaToolName | null {
  const match = /^media\.([a-z-]+)\.(.+)$/i.exec(name);
  if (!match) return null;

  const actionCandidate = match[1] as MediaToolAction;
  if (!ACTION_SET.has(actionCandidate)) return null;

  const playerId = match[2]?.trim();
  if (!playerId) return null;

  return {
    action: actionCandidate,
    playerId,
  };
}

export function isPlaylistAction(action: MediaToolAction): boolean {
  return PLAYLIST_MEDIA_ACTIONS.includes(action);
}
