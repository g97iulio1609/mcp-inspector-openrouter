/**
 * IManifestPersistencePort — Port for persisting MCP tool manifests.
 *
 * Provides IndexedDB-backed persistence for SiteToolManifest data,
 * enabling instant manifest availability on page load without re-scanning.
 */

import type { SiteToolManifest } from './tool-manifest.port';

export interface IManifestPersistencePort {
  /** Persist a manifest for the given origin. */
  save(origin: string, manifest: SiteToolManifest): Promise<void>;

  /** Load a previously persisted manifest, or null if none exists. */
  load(origin: string): Promise<SiteToolManifest | null>;

  /** List all origins with persisted manifests. */
  listOrigins(): Promise<string[]>;

  /** Delete the persisted manifest for the given origin. */
  delete(origin: string): Promise<void>;
}
