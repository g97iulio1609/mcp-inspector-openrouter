/**
 * Tests for TypedEventBus.
 */

import { describe, it, expect, vi } from 'vitest';
import { TypedEventBus } from '../event-bus';

/** Test event map */
interface TestEvents {
  'msg': { readonly text: string };
  'count': { readonly n: number };
  'empty': undefined;
}

function createBus(): TypedEventBus<TestEvents> {
  return new TypedEventBus<TestEvents>();
}

describe('TypedEventBus', () => {
  // 1. on() receives events of matching type
  it('on() receives events of matching type', () => {
    const bus = createBus();
    const received: Array<{ text: string }> = [];
    bus.on('msg', (data) => received.push(data));

    bus.emit('msg', { text: 'hello' });

    expect(received).toEqual([{ text: 'hello' }]);
  });

  // 2. on() does not receive events of other types
  it('on() does not receive events of other types', () => {
    const bus = createBus();
    const received: unknown[] = [];
    bus.on('msg', (data) => received.push(data));

    bus.emit('count', { n: 42 });

    expect(received).toEqual([]);
  });

  // 3. wildcard * receives all events
  it('wildcard * receives all events', () => {
    const bus = createBus();
    const received: string[] = [];
    bus.on('*', (type) => received.push(type));

    bus.emit('msg', { text: 'a' });
    bus.emit('count', { n: 1 });
    bus.emit('empty');

    expect(received).toEqual(['msg', 'count', 'empty']);
  });

  // 4. wildcard * receives type and data
  it('wildcard * receives type and data', () => {
    const bus = createBus();
    const calls: Array<[string, unknown]> = [];
    bus.on('*', (type, data) => calls.push([type, data]));

    bus.emit('msg', { text: 'hi' });

    expect(calls).toEqual([['msg', { text: 'hi' }]]);
  });

  // 5. once() fires only once then auto-unsubscribes
  it('once() fires only once then auto-unsubscribes', () => {
    const bus = createBus();
    const received: unknown[] = [];
    bus.once('msg', (data) => received.push(data));

    bus.emit('msg', { text: 'first' });
    bus.emit('msg', { text: 'second' });

    expect(received).toEqual([{ text: 'first' }]);
  });

  // 6. unsubscribe function works
  it('unsubscribe function removes the listener', () => {
    const bus = createBus();
    const received: unknown[] = [];
    const unsub = bus.on('msg', (data) => received.push(data));

    bus.emit('msg', { text: 'before' });
    unsub();
    bus.emit('msg', { text: 'after' });

    expect(received).toEqual([{ text: 'before' }]);
  });

  // 7. emit() with undefined payload works for events with no data
  it('emit() with undefined payload works for no-data events', () => {
    const bus = createBus();
    const fired = vi.fn();
    bus.on('empty', fired);

    bus.emit('empty');

    expect(fired).toHaveBeenCalledTimes(1);
    expect(fired).toHaveBeenCalledWith(undefined);
  });

  // 8. dispose() clears all listeners
  it('dispose() clears all listeners', () => {
    const bus = createBus();
    bus.on('msg', () => {});
    bus.on('count', () => {});
    bus.on('*', () => {});

    bus.dispose();

    expect(bus.listenerCount()).toBe(0);
  });

  // 9. listenerCount() returns correct count
  it('listenerCount() returns correct count per type and total', () => {
    const bus = createBus();
    bus.on('msg', () => {});
    bus.on('msg', () => {});
    bus.on('count', () => {});
    bus.on('*', () => {});

    expect(bus.listenerCount('msg')).toBe(2);
    expect(bus.listenerCount('count')).toBe(1);
    expect(bus.listenerCount('*')).toBe(1);
    expect(bus.listenerCount('empty')).toBe(0);
    expect(bus.listenerCount()).toBe(4);
  });

  // 10. listener errors are isolated (don't break other listeners)
  it('listener errors are isolated', () => {
    const bus = createBus();
    const received: unknown[] = [];
    bus.on('msg', () => { throw new Error('boom'); });
    bus.on('msg', (data) => received.push(data));

    bus.emit('msg', { text: 'safe' });

    expect(received).toEqual([{ text: 'safe' }]);
  });

  // 11. snapshot prevents skipping when listener unsubscribes during emit
  it('snapshot prevents skipping when listener unsubscribes during emit', () => {
    const bus = createBus();
    const received: unknown[] = [];
    let unsub2: () => void;

    bus.on('msg', () => { unsub2(); });
    unsub2 = bus.on('msg', (data) => received.push(data));

    bus.emit('msg', { text: 'check' });

    expect(received).toEqual([{ text: 'check' }]);
  });

  // 12. once() unsubscribe function works before event fires
  it('once() unsubscribe cancels before event fires', () => {
    const bus = createBus();
    const received: unknown[] = [];
    const unsub = bus.once('msg', (data) => received.push(data));

    unsub();
    bus.emit('msg', { text: 'nope' });

    expect(received).toEqual([]);
  });

  // 13. wildcard errors are isolated from typed listeners
  it('wildcard listener error does not affect typed listeners', () => {
    const bus = createBus();
    const received: unknown[] = [];
    bus.on('msg', (data) => received.push(data));
    bus.on('*', () => { throw new Error('wildcard boom'); });

    bus.emit('msg', { text: 'ok' });

    expect(received).toEqual([{ text: 'ok' }]);
  });
});
