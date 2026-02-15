---
sidebar_position: 13
---

# IGesturePort

Platform-agnostic touch gesture support for mobile-oriented web apps.

## Interface

```typescript
interface IGesturePort {
  swipe(element: Element, direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void>;
  scroll(element: Element, direction: 'up' | 'down', amount?: number): Promise<void>;
  pinch(element: Element, scale: number): Promise<void>;
  longPress(element: Element, duration?: number): Promise<void>;
}
```

## Adapter

`GestureAdapter` dispatches realistic `TouchEvent` sequences with proper coordinates, timing, and event ordering (touchstart → touchmove → touchend).

Used by `InstagramAdapter` for stories, reels scrolling, and swipe navigation.
