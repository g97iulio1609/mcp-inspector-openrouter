import { BaseCustomNativePlayer } from './base-custom-native-player';

export class JWPlayerAdapter extends BaseCustomNativePlayer {
  readonly platform = 'jwplayer' as const;

  constructor(
    id: string,
    mediaElement: HTMLMediaElement,
    rootElement: Element,
  ) {
    super(id, 'jwplayer', mediaElement, rootElement);
  }
}
