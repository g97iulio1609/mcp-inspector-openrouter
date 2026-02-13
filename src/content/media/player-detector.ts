import type { IVideoPlayer } from './types';
import { NativePlayerAdapter } from './native-player';
import { YouTubePlayer } from './iframe-players/youtube-player';

export class PlayerDetector {
  detect(root: Document | Element | ShadowRoot): IVideoPlayer[] {
    const players: IVideoPlayer[] = [];
    const claimed = new WeakSet<Element>();

    this.detectYouTube(root, claimed, players);
    this.detectNative(root, claimed, players);

    return players;
  }

  private detectYouTube(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
  ): void {
    const iframes = this.queryAll<HTMLIFrameElement>(root, 'iframe[src]');
    let index = 0;

    for (const iframe of iframes) {
      if (claimed.has(iframe)) continue;
      const src = iframe.getAttribute('src') ?? '';
      if (!this.isYouTubeEmbed(src)) continue;

      try {
        const id = this.makeId('youtube', iframe, index);
        players.push(new YouTubePlayer(id, iframe));
        claimed.add(iframe);
        index += 1;
      } catch {
        // Skip invalid/uncontrollable iframe players.
      }
    }
  }

  private detectNative(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
  ): void {
    const mediaEls = this.queryAll<HTMLMediaElement>(root, 'video, audio');
    let index = 0;

    for (const media of mediaEls) {
      if (claimed.has(media)) continue;
      const id = this.makeId(media.tagName.toLowerCase(), media, index);
      players.push(new NativePlayerAdapter(id, media));
      claimed.add(media);
      index += 1;
    }
  }

  private queryAll<TElement extends Element>(
    root: Document | Element | ShadowRoot,
    selector: string,
  ): TElement[] {
    return Array.from((root as ParentNode).querySelectorAll(selector)) as TElement[];
  }

  private makeId(prefix: string, el: Element, index: number): string {
    const seed =
      el.id ||
      el.getAttribute('name') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('src') ||
      `${prefix}-${index}`;

    return `${prefix}-${this.slugify(seed)}-${index}`;
  }

  private slugify(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }

  private isYouTubeEmbed(src: string): boolean {
    if (!src) return false;

    try {
      const url = new URL(src, location.href);
      const host = url.hostname.toLowerCase();
      return (
        host === 'youtube.com' ||
        host === 'www.youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'www.youtube-nocookie.com' ||
        host === 'youtu.be'
      );
    } catch {
      return false;
    }
  }
}
