import { describe, expect, it, vi } from 'vitest';
import { PlayerDetector } from '../player-detector';

describe('PlayerDetector', () => {
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
  });

  it('skips non-supported iframe origins', () => {
    const root = document.createElement('div');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', 'https://example.com/embed/abc123');
    root.appendChild(iframe);

    const detector = new PlayerDetector();
    const players = detector.detect(root);

    expect(players).toHaveLength(0);
  });
});
