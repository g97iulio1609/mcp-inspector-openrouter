import { PlayerDetector } from './player-detector';
import type { IVideoPlayer } from './types';

export class PlayerRegistry {
  private readonly detector = new PlayerDetector();
  private playersById = new Map<string, IVideoPlayer>();

  refresh(root: Document | Element | ShadowRoot = document): IVideoPlayer[] {
    const detectedPlayers = this.detector.detect(root);
    const nextPlayers = new Map<string, IVideoPlayer>();

    for (const detected of detectedPlayers) {
      const existing = this.playersById.get(detected.id);
      if (existing && existing.isAlive()) {
        detected.dispose();
        nextPlayers.set(existing.id, existing);
      } else {
        if (existing) existing.dispose();
        nextPlayers.set(detected.id, detected);
      }
    }

    for (const [id, previous] of this.playersById.entries()) {
      if (!nextPlayers.has(id)) {
        previous.dispose();
      }
    }

    this.playersById = nextPlayers;
    return this.getAll();
  }

  getById(id: string): IVideoPlayer | null {
    const player = this.playersById.get(id) ?? null;
    if (!player) return null;
    if (!player.isAlive()) {
      player.dispose();
      this.playersById.delete(id);
      return null;
    }
    return player;
  }

  getAll(): IVideoPlayer[] {
    const alive: IVideoPlayer[] = [];
    for (const [id, player] of this.playersById.entries()) {
      if (player.isAlive()) {
        alive.push(player);
      } else {
        player.dispose();
        this.playersById.delete(id);
      }
    }
    return alive;
  }

  dispose(): void {
    for (const player of this.playersById.values()) {
      player.dispose();
    }
    this.playersById.clear();
  }
}

let singleton: PlayerRegistry | null = null;

export function getPlayerRegistry(): PlayerRegistry {
  singleton ??= new PlayerRegistry();
  return singleton;
}
