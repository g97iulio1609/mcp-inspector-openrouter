/**
 * state-manager.ts — Centralized per-conversation state reset.
 *
 * Components that hold per-conversation state implement IResettable
 * and register themselves here. On conversation switch/create/delete
 * a single call to resetConversationState() atomically resets all of them.
 */

/** Anything that holds per-conversation state. */
export interface IResettable {
  resetOnConversationChange(): void;
}

export class StateManager {
  private readonly resettables: IResettable[] = [];

  register(resettable: IResettable): void {
    if (!this.resettables.includes(resettable)) {
      this.resettables.push(resettable);
    }
  }

  unregister(resettable: IResettable): void {
    const idx = this.resettables.indexOf(resettable);
    if (idx !== -1) this.resettables.splice(idx, 1);
  }

  /** Atomically reset all registered per-conversation state. */
  resetConversationState(): void {
    for (const r of this.resettables) {
      r.resetOnConversationChange();
    }
  }
}
