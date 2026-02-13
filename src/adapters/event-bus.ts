/**
 * TypedEventBus — Generic, type-safe event bus with wildcard and once support.
 *
 * Provides a strongly typed publish/subscribe mechanism for decoupled
 * communication between components. Listeners are snapshot-copied before
 * iteration so that unsubscribes during emit never skip siblings.
 */

/** Listener for a specific event type */
type EventListener<T> = (data: T) => void;

/** Listener for the wildcard `*` — receives every event */
type WildcardListener = (type: string, data: unknown) => void;

export class TypedEventBus<T extends { [K in keyof T]: unknown }> {
  private readonly listeners = new Map<keyof T | '*', Set<Function>>();

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on<K extends keyof T>(type: K, listener: EventListener<T[K]>): () => void;
  /** Subscribe to all events via wildcard. */
  on(type: '*', listener: WildcardListener): () => void;
  on(type: keyof T | '*', listener: Function): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => { set!.delete(listener); };
  }

  /**
   * Subscribe to a single occurrence of an event type.
   * The listener is automatically removed after the first match.
   */
  once<K extends keyof T>(type: K, listener: EventListener<T[K]>): () => void {
    const wrapper = ((data: T[K]) => {
      unsub();
      listener(data);
    }) as EventListener<T[K]>;
    const unsub = this.on(type, wrapper);
    return unsub;
  }

  /**
   * Emit an event. Listeners are snapshot-copied before iteration so
   * that unsubscribes during emit never cause other listeners to be skipped.
   */
  emit<K extends keyof T>(type: K, ...args: T[K] extends undefined ? [] : [T[K]]): void {
    const data = args[0] as T[K];

    const typed = this.listeners.get(type);
    if (typed) {
      const snapshot = [...typed];
      for (const fn of snapshot) {
        try { (fn as EventListener<T[K]>)(data); } catch { /* isolate */ }
      }
    }

    const wildcard = this.listeners.get('*');
    if (wildcard) {
      const snapshot = [...wildcard];
      for (const fn of snapshot) {
        try { (fn as WildcardListener)(type as string, data); } catch { /* isolate */ }
      }
    }
  }

  /** Remove all listeners. */
  dispose(): void {
    this.listeners.clear();
  }

  /**
   * Return the number of listeners for a specific type, or the total
   * across all types when called without arguments.
   */
  listenerCount(type?: keyof T | '*'): number {
    if (type !== undefined) {
      return this.listeners.get(type)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }
}
