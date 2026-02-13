import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerDetector } from '../player-detector';

describe('PlayerDetector', () => {
  afterEach((): void => {
    document.body.innerHTML = '';
  });

  it('detects YouTube iframe before native media elements', () => {
    const root = document.createElement('div');

    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1');
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() },
      configurable: true,
    });

    const video = document.createElement('video');
    video.id = 'native-player';

    root.appendChild(iframe);
    root.appendChild(video);

    const detector = new PlayerDetector();
    const players = detector.detect(root);

    expect(players.length).toBe(2);
    expect(players[0].platform).toBe('youtube');
    expect(players[1].platform).toBe('native');

    for (const player of players) {
      player.dispose();
    }
  });

  it('detects iframe platforms in priority order before native players', () => {
    const root = document.createElement('div');

    const mkIframe = (src: string): HTMLIFrameElement => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', src);
      Object.defineProperty(iframe, 'contentWindow', {
        value: { postMessage: vi.fn() },
        configurable: true,
      });
      return iframe;
    };

    root.appendChild(mkIframe('https://player.vimeo.com/video/12345'));
    root.appendChild(mkIframe('https://www.dailymotion.com/embed/video/x1x2x3'));
    root.appendChild(mkIframe('https://player.twitch.tv/?video=123&parent=example.com'));
    root.appendChild(mkIframe('https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1'));

    const video = document.createElement('video');
    root.appendChild(video);

    const detector = new PlayerDetector();
    const players = detector.detect(root);

    expect(players.map((p) => p.platform)).toEqual([
      'youtube',
      'vimeo',
      'dailymotion',
      'twitch',
      'native',
    ]);

    for (const player of players) {
      player.dispose();
    }
  });

  it('skips non-supported iframe origins', () => {
    const root = document.createElement('div');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', 'https://example.com/embed/abc123');
    root.appendChild(iframe);

    const detector = new PlayerDetector();
    const players = detector.detect(root);

    expect(players).toHaveLength(0);

    for (const player of players) {
      player.dispose();
    }
  });
});
