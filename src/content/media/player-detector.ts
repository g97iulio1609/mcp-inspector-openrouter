import type { IVideoPlayer } from './types';
import { JWPlayerAdapter } from './custom-players/jwplayer-player';
import { MediaElementPlayer } from './custom-players/mediaelement-player';
import { PlyrPlayer } from './custom-players/plyr-player';
import { VideoJsPlayer } from './custom-players/videojs-player';
import { NativePlayerAdapter } from './native-player';
import { DailymotionPlayer } from './iframe-players/dailymotion-player';
import { TwitchPlayer } from './iframe-players/twitch-player';
import { VimeoPlayer } from './iframe-players/vimeo-player';
import { YouTubePlayer } from './iframe-players/youtube-player';

export class PlayerDetector {
  detect(root: Document | Element | ShadowRoot): IVideoPlayer[] {
    const players: IVideoPlayer[] = [];
    const claimed = new WeakSet<Element>();

    this.detectYouTube(root, claimed, players);
    this.detectVimeo(root, claimed, players);
    this.detectDailymotion(root, claimed, players);
    this.detectTwitch(root, claimed, players);
    this.detectCustomPlayers(root, claimed, players);
    this.detectNative(root, claimed, players);

    return players;
  }

  private detectVimeo(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
  ): void {
    this.detectIframeByPredicate(root, claimed, players, {
      prefix: 'vimeo',
      predicate: (src) => this.isVimeoEmbed(src),
      create: (id, iframe) => new VimeoPlayer(id, iframe),
    });
  }

  private detectDailymotion(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
  ): void {
    this.detectIframeByPredicate(root, claimed, players, {
      prefix: 'dailymotion',
      predicate: (src) => this.isDailymotionEmbed(src),
      create: (id, iframe) => new DailymotionPlayer(id, iframe),
    });
  }

  private detectTwitch(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
  ): void {
    this.detectIframeByPredicate(root, claimed, players, {
      prefix: 'twitch',
      predicate: (src) => this.isTwitchEmbed(src),
      create: (id, iframe) => new TwitchPlayer(id, iframe),
    });
  }

  private detectIframeByPredicate(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
    options: {
      prefix: string;
      predicate: (src: string) => boolean;
      create: (id: string, iframe: HTMLIFrameElement) => IVideoPlayer;
    },
  ): void {
    const iframes = this.queryAll<HTMLIFrameElement>(root, 'iframe[src]');
    let index = 0;

    for (const iframe of iframes) {
      if (claimed.has(iframe)) continue;
      const src = iframe.getAttribute('src') ?? '';
      if (!options.predicate(src)) continue;

      try {
        const id = this.makeId(options.prefix, iframe, index);
        players.push(options.create(id, iframe));
        claimed.add(iframe);
        index += 1;
      } catch {
        // Skip invalid/uncontrollable iframe players.
      }
    }
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

  private detectCustomPlayers(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
  ): void {
    this.detectCustomBySelector(root, claimed, players, {
      selector: '.video-js',
      prefix: 'videojs',
      create: (id, media, host) => new VideoJsPlayer(id, media, host),
    });

    this.detectCustomBySelector(root, claimed, players, {
      selector: '.plyr',
      prefix: 'plyr',
      create: (id, media, host) => new PlyrPlayer(id, media, host),
    });

    this.detectCustomBySelector(root, claimed, players, {
      selector: '.jwplayer, [id^="jwplayer"], [class*="jwplayer"]',
      prefix: 'jwplayer',
      create: (id, media, host) => new JWPlayerAdapter(id, media, host),
    });

    this.detectCustomBySelector(root, claimed, players, {
      selector: '.mejs__container, .mejs-container',
      prefix: 'mediaelement',
      create: (id, media, host) => new MediaElementPlayer(id, media, host),
    });
  }

  private detectCustomBySelector(
    root: Document | Element | ShadowRoot,
    claimed: WeakSet<Element>,
    players: IVideoPlayer[],
    options: {
      selector: string;
      prefix: string;
      create: (id: string, media: HTMLMediaElement, host: Element) => IVideoPlayer;
    },
  ): void {
    const hosts = this.queryAll<Element>(root, options.selector);
    let index = 0;

    for (const host of hosts) {
      if (claimed.has(host)) continue;

      const media = host.querySelector('video, audio') as HTMLMediaElement | null;
      if (!media || claimed.has(media)) continue;

      const id = this.makeId(options.prefix, host, index);
      players.push(options.create(id, media, host));

      claimed.add(host);
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

  private isVimeoEmbed(src: string): boolean {
    if (!src) return false;

    try {
      const url = new URL(src, location.href);
      const host = url.hostname.toLowerCase();
      return host === 'player.vimeo.com' || host === 'vimeo.com' || host === 'www.vimeo.com';
    } catch {
      return false;
    }
  }

  private isDailymotionEmbed(src: string): boolean {
    if (!src) return false;

    try {
      const url = new URL(src, location.href);
      const host = url.hostname.toLowerCase();
      return host === 'www.dailymotion.com' || host === 'dailymotion.com';
    } catch {
      return false;
    }
  }

  private isTwitchEmbed(src: string): boolean {
    if (!src) return false;

    try {
      const url = new URL(src, location.href);
      const host = url.hostname.toLowerCase();
      return host === 'player.twitch.tv' || host === 'www.twitch.tv' || host === 'twitch.tv';
    } catch {
      return false;
    }
  }
}
