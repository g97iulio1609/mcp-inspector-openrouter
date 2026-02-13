import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '../../../types';
import type { IVideoPlayer } from '../../media';
import { getPlayerRegistry } from '../../media';
import { MediaScanner } from '../../scanners/media-scanner';
import { MediaExecutor } from '../media-executor';

describe('MediaExecutor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    getPlayerRegistry().dispose();
  });

  it('returns unified state for get-state action', async () => {
    const video = document.createElement('video');
    video.id = 'demo-video';
    video.volume = 0.7;
    video.currentTime = 15;
    document.body.appendChild(video);

    const scanner = new MediaScanner();
    const tools = scanner.scan(document);
    const stateTool = tools.find((t) => t.name.startsWith('media.get-state.')) as Tool;

    const executor = new MediaExecutor();
    const result = await executor.execute(stateTool, {});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      platform: 'native',
      currentTime: 15,
      volume: 0.7,
      hasPlaylist: false,
    });
  });

  it('sets media volume via set-volume action', async () => {
    const video = document.createElement('video');
    video.id = 'volume-video';
    document.body.appendChild(video);

    const scanner = new MediaScanner();
    const tools = scanner.scan(document);
    const volumeTool = tools.find((t) => t.name.startsWith('media.set-volume.')) as Tool;

    const executor = new MediaExecutor();
    const result = await executor.execute(volumeTool, { level: 0.35 });

    expect(result.success).toBe(true);
    expect(video.volume).toBeCloseTo(0.35);
  });

  it('seeks media timeline via seek action', async () => {
    const video = document.createElement('video');
    video.id = 'seek-video';
    document.body.appendChild(video);

    const scanner = new MediaScanner();
    const tools = scanner.scan(document);
    const seekTool = tools.find((t) => t.name.startsWith('media.seek.')) as Tool;

    const executor = new MediaExecutor();
    const result = await executor.execute(seekTool, { time: 22 });

    expect(result.success).toBe(true);
    expect(video.currentTime).toBe(22);
  });

  it('extracts transcript for YouTube players via get-transcript action', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);

    const fakePlayer: IVideoPlayer = {
      id: 'youtube-demo',
      platform: 'youtube',
      capabilities: {
        play: true,
        pause: true,
        seek: true,
        setVolume: true,
        mute: true,
        unmute: true,
        getState: true,
      },
      anchorElement: anchor,
      play: async (): Promise<void> => undefined,
      pause: async (): Promise<void> => undefined,
      seek: async (_time: number): Promise<void> => undefined,
      setVolume: async (_level: number): Promise<void> => undefined,
      mute: async (): Promise<void> => undefined,
      unmute: async (): Promise<void> => undefined,
      getState: async () => ({
        currentTime: 0,
        duration: 0,
        paused: true,
        volume: 1,
        muted: false,
        playbackRate: 1,
        title: 'YouTube Video',
        platform: 'youtube',
        hasPlaylist: true,
      }),
      isAlive: (): boolean => true,
      dispose: (): void => undefined,
    };

    const registry = getPlayerRegistry();
    const refreshSpy = vi.spyOn(registry, 'refresh').mockReturnValue([fakePlayer]);
    const getByIdSpy = vi.spyOn(registry, 'getById').mockReturnValue(fakePlayer);

    const seg1 = document.createElement('ytd-transcript-segment-renderer');
    const text1 = document.createElement('span');
    text1.id = 'segment-text';
    text1.textContent = 'Hello world';
    seg1.appendChild(text1);

    const seg2 = document.createElement('ytd-transcript-segment-renderer');
    const text2 = document.createElement('span');
    text2.id = 'segment-text';
    text2.textContent = 'Second sentence';
    seg2.appendChild(text2);

    document.body.append(seg1, seg2);

    const transcriptTool: Tool = {
      name: 'media.get-transcript.youtube-demo',
      description: 'Extract transcript',
      category: 'media',
      inputSchema: { type: 'object', properties: {} },
      _el: anchor,
    };

    const executor = new MediaExecutor();
    const result = await executor.execute(transcriptTool, {});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      text: expect.any(String),
      segments: expect.any(Array),
    });
    const transcript = result.data as { text: string; segments: string[] };
    expect(transcript.text).toContain('Hello world');
    expect(transcript.text).toContain('Second sentence');
    expect(transcript.segments).toEqual(['Hello world', 'Second sentence']);

    refreshSpy.mockRestore();
    getByIdSpy.mockRestore();
  });
});
