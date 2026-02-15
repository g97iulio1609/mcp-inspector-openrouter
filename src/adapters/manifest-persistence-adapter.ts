/**
 * ManifestPersistenceAdapter — IManifestPersistencePort implementation
 * using IndexedDB for persistent storage of SiteToolManifest data.
 *
 * Uses the `wmcp_manifests` object store with origin as key.
 */

import type { IManifestPersistencePort } from '../ports/manifest-persistence.port';
import type { SiteToolManifest } from '../ports/tool-manifest.port';

const DB_NAME = 'webmcp-manifest-persistence';
const DB_VERSION = 1;
const STORE_NAME = 'wmcp_manifests';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'origin' });
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error);
  });
}

export class ManifestPersistenceAdapter implements IManifestPersistencePort {
  async save(origin: string, manifest: SiteToolManifest): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ ...manifest, origin });
      tx.oncomplete = (): void => { db.close(); resolve(); };
      tx.onerror = (): void => { db.close(); reject(tx.error); };
    });
  }

  async load(origin: string): Promise<SiteToolManifest | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(origin);
      req.onsuccess = (): void => { db.close(); resolve(req.result ?? null); };
      req.onerror = (): void => { db.close(); reject(req.error); };
    });
  }

  async listOrigins(): Promise<string[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = (): void => { db.close(); resolve(req.result as string[]); };
      req.onerror = (): void => { db.close(); reject(req.error); };
    });
  }

  async delete(origin: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(origin);
      tx.oncomplete = (): void => { db.close(); resolve(); };
      tx.onerror = (): void => { db.close(); reject(tx.error); };
    });
  }
}
