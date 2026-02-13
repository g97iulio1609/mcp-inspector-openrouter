import { beforeEach, describe, expect, it } from 'vitest';
import type { Tool } from '../../../types';
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
});
