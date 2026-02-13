import { BaseCustomNativePlayer } from './base-custom-native-player';

export class PlyrPlayer extends BaseCustomNativePlayer {
  readonly platform = 'plyr' as const;

  constructor(
    id: string,
    mediaElement: HTMLMediaElement,
    rootElement: Element,
  ) {
    super(id, 'plyr', mediaElement, rootElement);
  }
}
