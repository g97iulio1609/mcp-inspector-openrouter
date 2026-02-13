import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IStateProvider, MediaLiveState } from '../../../types/live-state.types';
import { LiveStateManager } from '../live-state-manager';
import { PollingEngine } from '../polling-engine';

// ── Fixtures ──

function makeDummyMediaProvider(): IStateProvider<MediaLiveState> {
  return {
    category: 'media',
    collect: () => [],
    dispose: () => {},
  };
}

// ── Tests ──

describe('PollingEngine', () => {
  let manager: LiveStateManager;
  let engine: PollingEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new LiveStateManager();
    manager.registerProvider(makeDummyMediaProvider());
    engine = new PollingEngine(manager, { pollingIntervalMs: 1000, activePollingIntervalMs: 200, enabled: true });
  });

  afterEach(() => {
    engine.dispose();
    manager.dispose();
    vi.useRealTimers();
  });

  it('starts without error', () => {
    expect(() => engine.start()).not.toThrow();
    expect(engine.isRunning()).toBe(true);
  });

  it('collects on interval tick', () => {
    const spy = vi.spyOn(manager, 'collectSnapshot');
    engine.start();

    // First tick at 1000ms (idle rate)
    vi.advanceTimersByTime(1000);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('stops polling on dispose', () => {
    const spy = vi.spyOn(manager, 'collectSnapshot');
    engine.start();
    engine.dispose();
    spy.mockClear();

    vi.advanceTimersByTime(5000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stops polling on stop', () => {
    const spy = vi.spyOn(manager, 'collectSnapshot');
    engine.start();
    engine.stop();
    spy.mockClear();

    vi.advanceTimersByTime(5000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports not running after stop', () => {
    engine.start();
    expect(engine.isRunning()).toBe(true);
    engine.stop();
    expect(engine.isRunning()).toBe(false);
  });

  it('is idempotent on multiple start calls', () => {
    engine.start();
    engine.start();
    expect(engine.isRunning()).toBe(true);
  });
});
