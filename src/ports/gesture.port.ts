/**
 * IGesturePort — contract for platform-agnostic touch gesture interactions.
 */

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';
export type ScrollDirection = 'up' | 'down';

export interface IGesturePort {
  swipe(direction: SwipeDirection, element?: HTMLElement): Promise<void>;
  scroll(direction: ScrollDirection, distance?: number): Promise<void>;
  pinch(scale: number, element?: HTMLElement): Promise<void>;
  longPress(element: HTMLElement, duration?: number): Promise<void>;
}
