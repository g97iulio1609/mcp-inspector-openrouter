import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IVideoPlayer } from '../../media';
import { MediaScanner } from '../media-scanner';

const mockRefresh = vi.fn<
  (root: Document | Element | ShadowRoot) => IVideoPlayer[]
>();

interface MockPlayerRegistry {
  refresh: (root: Document | Element | ShadowRoot) => IVideoPlayer[];
  getById: (id: string) => IVideoPlayer | null;
  getAll: () => IVideoPlayer[];
  dispose: () => void;
}

vi.mock('../../media', async () => {
  const actual = await vi.importActual<typeof import('../../media')>('../../media');

  return {
    ...actual,
    getPlayerRegistry: (): MockPlayerRegistry => ({
      refresh: mockRefresh,
      getById: (_id: string): IVideoPlayer | null => null,
      getAll: (): IVideoPlayer[] => [],
      dispose: (): void => undefined,
    }),
  };
});

describe('MediaScanner', () => {
  beforeEach((): void => {
    document.body.innerHTML = '';
    const anchor = document.createElement('div');
    anchor.setAttribute('aria-label', 'Spotify Embed');

    const fakePlayer: IVideoPlayer = {
      id: 'spotify-test-player',
      platform: 'spotify',
      capabilities: {
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
      },
      anchorElement: anchor,
      play: async () => undefined,
      pause: async () => undefined,
      seek: async () => undefined,
      setVolume: async () => undefined,
      mute: async () => undefined,
      unmute: async () => undefined,
      getState: async () => ({
        currentTime: 0,
        duration: 0,
        paused: true,
        volume: 1,
        muted: false,
        playbackRate: 1,
        title: 'Spotify Embed',
        platform: 'spotify',
        hasPlaylist: true,
      }),
      nextTrack: async () => undefined,
      previousTrack: async () => undefined,
      shuffle: async () => undefined,
      isAlive: () => true,
      dispose: () => undefined,
    };

    mockRefresh.mockReset();
    mockRefresh.mockReturnValue([fakePlayer]);
  });

  it('emits playlist tools for Spotify embeds', () => {
    const scanner = new MediaScanner();
    const tools = scanner.scan(document);
    const names = tools.map((t) => t.name);

    expect(names.some((n) => n.startsWith('media.next-track.'))).toBe(true);
    expect(names.some((n) => n.startsWith('media.previous-track.'))).toBe(true);
    expect(names.some((n) => n.startsWith('media.shuffle.'))).toBe(true);
  });
});
