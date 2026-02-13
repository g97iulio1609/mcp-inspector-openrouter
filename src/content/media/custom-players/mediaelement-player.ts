import { BaseCustomNativePlayer } from './base-custom-native-player';

export class MediaElementPlayer extends BaseCustomNativePlayer {
  readonly platform = 'mediaelement' as const;

  constructor(
    id: string,
    mediaElement: HTMLMediaElement,
    rootElement: Element,
  ) {
    super(id, 'mediaelement', mediaElement, rootElement);
  }
}
