import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GestureAdapter } from '../gesture-adapter';

describe('GestureAdapter', () => {
  let adapter: GestureAdapter;

  beforeEach(() => {
    adapter = new GestureAdapter();
    document.body.innerHTML = '';
  });

  // ── swipe ──

  it('swipe("up") dispatches touchstart, touchmove, and touchend', async () => {
    const events: string[] = [];
    document.body.addEventListener('touchstart', () => events.push('touchstart'));
    document.body.addEventListener('touchmove', () => events.push('touchmove'));
    document.body.addEventListener('touchend', () => events.push('touchend'));

    await adapter.swipe('up');
    expect(events[0]).toBe('touchstart');
    expect(events[events.length - 1]).toBe('touchend');
    expect(events.filter((e) => e === 'touchmove').length).toBeGreaterThanOrEqual(1);
  });

  it('swipe("up") endY is less than startY', async () => {
    let startY = 0;
    let endY = 0;
    document.body.addEventListener('touchstart', (e: TouchEvent) => {
      startY = e.changedTouches[0].clientY;
    });
    document.body.addEventListener('touchend', (e: TouchEvent) => {
      endY = e.changedTouches[0].clientY;
    });

    await adapter.swipe('up');
    expect(endY).toBeLessThan(startY);
  });

  it('swipe("down") endY is greater than startY', async () => {
    let startY = 0;
    let endY = 0;
    document.body.addEventListener('touchstart', (e: TouchEvent) => {
      startY = e.changedTouches[0].clientY;
    });
    document.body.addEventListener('touchend', (e: TouchEvent) => {
      endY = e.changedTouches[0].clientY;
    });

    await adapter.swipe('down');
    expect(endY).toBeGreaterThan(startY);
  });

  it('swipe("left") endX is less than startX', async () => {
    let startX = 0;
    let endX = 0;
    document.body.addEventListener('touchstart', (e: TouchEvent) => {
      startX = e.changedTouches[0].clientX;
    });
    document.body.addEventListener('touchend', (e: TouchEvent) => {
      endX = e.changedTouches[0].clientX;
    });

    await adapter.swipe('left');
    expect(endX).toBeLessThan(startX);
  });

  it('swipe("right") endX is greater than startX', async () => {
    let startX = 0;
    let endX = 0;
    document.body.addEventListener('touchstart', (e: TouchEvent) => {
      startX = e.changedTouches[0].clientX;
    });
    document.body.addEventListener('touchend', (e: TouchEvent) => {
      endX = e.changedTouches[0].clientX;
    });

    await adapter.swipe('right');
    expect(endX).toBeGreaterThan(startX);
  });

  it('swipe dispatches on a custom element when provided', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const events: string[] = [];
    div.addEventListener('touchstart', () => events.push('touchstart'));
    div.addEventListener('touchend', () => events.push('touchend'));

    await adapter.swipe('up', div);
    expect(events).toContain('touchstart');
    expect(events).toContain('touchend');
  });

  it('swipe dispatches multiple touchmove events', async () => {
    let moveCount = 0;
    document.body.addEventListener('touchmove', () => moveCount++);
    await adapter.swipe('up');
    expect(moveCount).toBeGreaterThanOrEqual(5);
  });

  // ── scroll ──

  it('scroll("down") calls scrollBy with positive value', async () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    await adapter.scroll('down');
    expect(spy).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
    spy.mockRestore();
  });

  it('scroll("up") calls scrollBy with negative value', async () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    await adapter.scroll('up');
    expect(spy).toHaveBeenCalledWith({ top: -600, behavior: 'smooth' });
    spy.mockRestore();
  });

  it('scroll uses custom distance', async () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    await adapter.scroll('down', 1200);
    expect(spy).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' });
    spy.mockRestore();
  });

  // ── pinch ──

  it('pinch dispatches touchstart, touchmove, touchend with two touches', async () => {
    const events: { type: string; touchCount: number }[] = [];
    document.body.addEventListener('touchstart', (e: TouchEvent) => {
      events.push({ type: 'touchstart', touchCount: e.changedTouches.length });
    });
    document.body.addEventListener('touchmove', (e: TouchEvent) => {
      events.push({ type: 'touchmove', touchCount: e.changedTouches.length });
    });
    document.body.addEventListener('touchend', (e: TouchEvent) => {
      events.push({ type: 'touchend', touchCount: e.changedTouches.length });
    });

    await adapter.pinch(2);
    expect(events[0]).toEqual({ type: 'touchstart', touchCount: 2 });
    expect(events[1]).toEqual({ type: 'touchmove', touchCount: 2 });
    expect(events[2]).toEqual({ type: 'touchend', touchCount: 2 });
  });

  it('pinch scale > 1 moves fingers apart', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    let startSpan = 0;
    let moveSpan = 0;
    div.addEventListener('touchstart', (e: TouchEvent) => {
      startSpan = Math.abs(e.changedTouches[1].clientX - e.changedTouches[0].clientX);
    });
    div.addEventListener('touchmove', (e: TouchEvent) => {
      moveSpan = Math.abs(e.changedTouches[1].clientX - e.changedTouches[0].clientX);
    });

    await adapter.pinch(2, div);
    expect(moveSpan).toBeGreaterThan(startSpan);
  });

  it('pinch scale < 1 moves fingers closer', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    let startSpan = 0;
    let moveSpan = 0;
    div.addEventListener('touchstart', (e: TouchEvent) => {
      startSpan = Math.abs(e.changedTouches[1].clientX - e.changedTouches[0].clientX);
    });
    div.addEventListener('touchmove', (e: TouchEvent) => {
      moveSpan = Math.abs(e.changedTouches[1].clientX - e.changedTouches[0].clientX);
    });

    await adapter.pinch(0.5, div);
    expect(moveSpan).toBeLessThan(startSpan);
  });

  // ── longPress ──

  it('longPress dispatches touchstart, waits, then touchend', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const events: { type: string; time: number }[] = [];
    const start = Date.now();
    div.addEventListener('touchstart', () => events.push({ type: 'touchstart', time: Date.now() - start }));
    div.addEventListener('touchend', () => events.push({ type: 'touchend', time: Date.now() - start }));

    await adapter.longPress(div, 50);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('touchstart');
    expect(events[1].type).toBe('touchend');
    expect(events[1].time - events[0].time).toBeGreaterThanOrEqual(40);
  });

  it('longPress uses center coordinates of element', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    // happy-dom returns 0,0,0,0 for getBoundingClientRect by default
    let touchX = -1;
    let touchY = -1;
    div.addEventListener('touchstart', (e: TouchEvent) => {
      touchX = e.changedTouches[0].clientX;
      touchY = e.changedTouches[0].clientY;
    });

    await adapter.longPress(div, 10);
    expect(touchX).toBe(0);
    expect(touchY).toBe(0);
  });
});
