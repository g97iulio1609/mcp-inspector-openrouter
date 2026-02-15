/**
 * GestureAdapter — platform-agnostic touch gesture execution engine.
 * Dispatches realistic TouchEvent sequences for swipe, scroll, pinch, and long press.
 */

import type { IGesturePort, SwipeDirection, ScrollDirection } from '../ports/gesture.port';

const DEFAULT_SWIPE_DISTANCE = 300;
const DEFAULT_SWIPE_STEPS = 5;
const DEFAULT_SCROLL_DISTANCE = 600;
const DEFAULT_LONG_PRESS_MS = 500;

/** Build a minimal Touch-like object for constructing TouchEvents. */
function createTouch(
  target: EventTarget,
  id: number,
  clientX: number,
  clientY: number,
): Touch {
  // happy-dom / jsdom may not support the Touch constructor, so we fall back
  // to a plain object that satisfies the Touch interface enough for tests.
  if (typeof Touch !== 'undefined') {
    try {
      return new Touch({ identifier: id, target, clientX, clientY });
    } catch {
      // constructor may throw in some environments
    }
  }
  return { identifier: id, target, clientX, clientY, pageX: clientX, pageY: clientY, screenX: clientX, screenY: clientY, radiusX: 0, radiusY: 0, rotationAngle: 0, force: 0 } as Touch;
}

function dispatchTouch(
  target: EventTarget,
  type: string,
  touches: Touch[],
  changedTouches: Touch[],
): void {
  const evt = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches,
    changedTouches,
  });
  target.dispatchEvent(evt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compute start/end coordinates for a swipe direction. */
function swipeCoordinates(direction: SwipeDirection, distance: number): { startX: number; startY: number; endX: number; endY: number } {
  const cx = 200;
  const cy = 400;
  switch (direction) {
    case 'up':    return { startX: cx, startY: cy + distance / 2, endX: cx, endY: cy - distance / 2 };
    case 'down':  return { startX: cx, startY: cy - distance / 2, endX: cx, endY: cy + distance / 2 };
    case 'left':  return { startX: cx + distance / 2, startY: cy, endX: cx - distance / 2, endY: cy };
    case 'right': return { startX: cx - distance / 2, startY: cy, endX: cx + distance / 2, endY: cy };
  }
}

export class GestureAdapter implements IGesturePort {
  async swipe(direction: SwipeDirection, element?: HTMLElement): Promise<void> {
    const target = element ?? document.body;
    const { startX, startY, endX, endY } = swipeCoordinates(direction, DEFAULT_SWIPE_DISTANCE);

    const touchId = 1;
    const startTouch = createTouch(target, touchId, startX, startY);
    dispatchTouch(target, 'touchstart', [startTouch], [startTouch]);

    // Intermediate move steps for realism
    for (let i = 1; i <= DEFAULT_SWIPE_STEPS; i++) {
      const ratio = i / DEFAULT_SWIPE_STEPS;
      const mx = startX + (endX - startX) * ratio;
      const my = startY + (endY - startY) * ratio;
      const moveTouch = createTouch(target, touchId, mx, my);
      dispatchTouch(target, 'touchmove', [moveTouch], [moveTouch]);
    }

    const endTouch = createTouch(target, touchId, endX, endY);
    dispatchTouch(target, 'touchend', [], [endTouch]);
  }

  async scroll(direction: ScrollDirection, distance?: number): Promise<void> {
    const d = distance ?? DEFAULT_SCROLL_DISTANCE;
    const top = direction === 'down' ? d : -d;
    window.scrollBy({ top, behavior: 'smooth' });
  }

  async pinch(scale: number, element?: HTMLElement): Promise<void> {
    const target = element ?? document.body;
    const cx = 200;
    const cy = 400;
    const baseDistance = 50;

    // Two-finger touch start
    const t1Start = createTouch(target, 1, cx - baseDistance, cy);
    const t2Start = createTouch(target, 2, cx + baseDistance, cy);
    dispatchTouch(target, 'touchstart', [t1Start, t2Start], [t1Start, t2Start]);

    // Move fingers to scaled positions
    const scaledDist = baseDistance * scale;
    const t1End = createTouch(target, 1, cx - scaledDist, cy);
    const t2End = createTouch(target, 2, cx + scaledDist, cy);
    dispatchTouch(target, 'touchmove', [t1End, t2End], [t1End, t2End]);

    dispatchTouch(target, 'touchend', [], [t1End, t2End]);
  }

  async longPress(element: HTMLElement, duration?: number): Promise<void> {
    const ms = duration ?? DEFAULT_LONG_PRESS_MS;
    const touchId = 1;
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const touch = createTouch(element, touchId, cx, cy);
    dispatchTouch(element, 'touchstart', [touch], [touch]);
    await sleep(ms);
    dispatchTouch(element, 'touchend', [], [touch]);
  }
}
