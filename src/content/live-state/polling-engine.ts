/**
 * PollingEngine — adaptive interval-based polling for live-state collection.
 *
 * Uses setInterval (not requestAnimationFrame) since this runs in an
 * extension content script. Switches between idle and active polling
 * rates based on user activity, and triggers immediate (debounced)
 * snapshots on DOM mutations.
 */

import type { LiveStateManagerConfig } from '../../types/live-state.types';
import type { LiveStateManager } from './live-state-manager';
import type { MediaStateProvider } from './providers/media-state-provider';

/** Events that indicate user activity */
const ACTIVITY_EVENTS: readonly string[] = [
  'mousemove',
  'keydown',
  'scroll',
  'click',
  'touchstart',
];

/** Time (ms) to remain in "active" mode after the last user interaction */
const ACTIVE_COOLDOWN_MS = 3000;

/** Debounce delay (ms) for mutation-triggered snapshots */
const MUTATION_DEBOUNCE_MS = 100;

export class PollingEngine {
  private readonly manager: LiveStateManager;
  private readonly config: LiveStateManagerConfig;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private mutationObserver: MutationObserver | null = null;
  private mutationDebounceId: ReturnType<typeof setTimeout> | null = null;

  private lastActivityTs = 0;
  private running = false;

  /** Bound handler references for clean removal */
  private readonly onActivity = (): void => {
    const wasIdle = !this.isActive();
    this.lastActivityTs = Date.now();
    // Only reschedule on idle → active transition to avoid timer starvation
    if (wasIdle) {
      this.reschedule();
    }
  };

  constructor(manager: LiveStateManager, config: LiveStateManagerConfig) {
    this.manager = manager;
    this.config = config;
  }

  // ── Lifecycle ──

  start(): void {
    if (this.running) return;
    this.running = true;

    this.addActivityListeners();
    this.startMutationObserver();
    this.scheduleTimer(this.config.pollingIntervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    this.clearTimer();
    this.clearMutationDebounce();
    this.removeActivityListeners();
    this.stopMutationObserver();
  }

  dispose(): void {
    this.stop();
    // null-out to free references
    this.mutationObserver = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  // ── Polling ──

  private scheduleTimer(intervalMs: number): void {
    this.clearTimer();
    this.timerId = setInterval(() => void this.tick(), intervalMs);
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /** Reschedule the timer when switching between idle/active rates */
  private reschedule(): void {
    if (!this.running) return;
    const interval = this.isActive()
      ? this.config.activePollingIntervalMs
      : this.config.pollingIntervalMs;
    this.scheduleTimer(interval);
  }

  private isActive(): boolean {
    return Date.now() - this.lastActivityTs < ACTIVE_COOLDOWN_MS;
  }

  /** Single poll tick: refresh async providers then collect a snapshot */
  private async tick(): Promise<void> {
    const mediaProvider = this.manager.getProviderByCategory('media') as
      | MediaStateProvider
      | undefined;

    if (mediaProvider?.refreshAsync) {
      await mediaProvider.refreshAsync();
    }

    this.manager.collectSnapshot();

    // If we were active but cooldown has elapsed, drop back to idle rate
    if (!this.isActive()) {
      this.reschedule();
    }
  }

  // ── Activity Detection ──

  private addActivityListeners(): void {
    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, this.onActivity, { passive: true });
    }
  }

  private removeActivityListeners(): void {
    for (const evt of ACTIVITY_EVENTS) {
      document.removeEventListener(evt, this.onActivity);
    }
  }

  // ── MutationObserver ──

  private startMutationObserver(): void {
    if (!document.body) return;

    this.mutationObserver = new MutationObserver(() => {
      this.debouncedMutationTick();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private stopMutationObserver(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    this.clearMutationDebounce();
  }

  private debouncedMutationTick(): void {
    this.clearMutationDebounce();
    this.mutationDebounceId = setTimeout(() => {
      this.mutationDebounceId = null;
      if (this.running) {
        void this.tick();
      }
    }, MUTATION_DEBOUNCE_MS);
  }

  private clearMutationDebounce(): void {
    if (this.mutationDebounceId !== null) {
      clearTimeout(this.mutationDebounceId);
      this.mutationDebounceId = null;
    }
  }
}
