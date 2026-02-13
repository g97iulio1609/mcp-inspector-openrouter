import { BaseCustomNativePlayer } from './base-custom-native-player';

export class VideoJsPlayer extends BaseCustomNativePlayer {
  readonly platform = 'videojs' as const;

  constructor(
    id: string,
    mediaElement: HTMLMediaElement,
    rootElement: Element,
  ) {
    super(id, 'videojs', mediaElement, rootElement);
  }
}
