/**
 * Tests for ManifestPersistenceAdapter — IndexedDB-backed persistence.
 *
 * Uses fake-indexeddb since happy-dom does not provide IndexedDB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ManifestPersistenceAdapter } from '../manifest-persistence-adapter';
import type { SiteToolManifest } from '../../ports/tool-manifest.port';
import type { IManifestPersistencePort } from '../../ports/manifest-persistence.port';

function makeManifest(origin: string, toolCount = 1): SiteToolManifest {
  const tools = Array.from({ length: toolCount }, (_, i) => ({
    name: `tool_${i}`,
    description: `Tool ${i}`,
    inputSchema: { type: 'object' as const, properties: {} },
    pagePatterns: ['/'],
  }));

  return {
    origin,
    version: 1,
    generatedAt: Date.now(),
    pages: {
      '/': {
        urlPattern: '/',
        tools: tools.map(t => t.name),
        lastScanned: Date.now(),
        hash: 'abc',
      },
    },
    tools,
  };
}

describe('ManifestPersistenceAdapter', () => {
  let adapter: ManifestPersistenceAdapter;

  beforeEach(async () => {
    // Reset the IndexedDB to ensure clean state between tests
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('webmcp-manifest-persistence');
      req.onsuccess = (): void => resolve();
      req.onerror = (): void => resolve();
    });
    adapter = new ManifestPersistenceAdapter();
  });

  describe('save and load', () => {
    it('returns null for unknown origin', async () => {
      const result = await adapter.load('unknown.com');
      expect(result).toBeNull();
    });

    it('persists and retrieves a manifest', async () => {
      const manifest = makeManifest('example.com');
      await adapter.save('example.com', manifest);

      const loaded = await adapter.load('example.com');
      expect(loaded).not.toBeNull();
      expect(loaded!.origin).toBe('example.com');
      expect(loaded!.tools).toHaveLength(1);
      expect(loaded!.tools[0].name).toBe('tool_0');
    });

    it('overwrites manifest for same origin', async () => {
      await adapter.save('example.com', makeManifest('example.com', 1));
      await adapter.save('example.com', makeManifest('example.com', 3));

      const loaded = await adapter.load('example.com');
      expect(loaded!.tools).toHaveLength(3);
    });

    it('stores manifests independently per origin', async () => {
      await adapter.save('a.com', makeManifest('a.com', 2));
      await adapter.save('b.com', makeManifest('b.com', 5));

      const a = await adapter.load('a.com');
      const b = await adapter.load('b.com');
      expect(a!.tools).toHaveLength(2);
      expect(b!.tools).toHaveLength(5);
    });
  });

  describe('listOrigins', () => {
    it('returns empty array when no manifests stored', async () => {
      const origins = await adapter.listOrigins();
      expect(origins).toEqual([]);
    });

    it('returns all stored origins', async () => {
      await adapter.save('a.com', makeManifest('a.com'));
      await adapter.save('b.com', makeManifest('b.com'));
      await adapter.save('c.com', makeManifest('c.com'));

      const origins = await adapter.listOrigins();
      expect(origins.sort()).toEqual(['a.com', 'b.com', 'c.com']);
    });
  });

  describe('delete', () => {
    it('removes a stored manifest', async () => {
      await adapter.save('example.com', makeManifest('example.com'));
      await adapter.delete('example.com');

      const loaded = await adapter.load('example.com');
      expect(loaded).toBeNull();
    });

    it('does not throw for unknown origin', async () => {
      await expect(adapter.delete('nonexistent.com')).resolves.toBeUndefined();
    });

    it('does not affect other origins', async () => {
      await adapter.save('a.com', makeManifest('a.com'));
      await adapter.save('b.com', makeManifest('b.com'));
      await adapter.delete('a.com');

      expect(await adapter.load('a.com')).toBeNull();
      expect(await adapter.load('b.com')).not.toBeNull();
    });
  });
});

// ── Port interface contract tests ──

describe('IManifestPersistencePort contract', () => {
  it('satisfies the port interface', () => {
    const adapter: IManifestPersistencePort = new ManifestPersistenceAdapter();
    expect(typeof adapter.save).toBe('function');
    expect(typeof adapter.load).toBe('function');
    expect(typeof adapter.listOrigins).toBe('function');
    expect(typeof adapter.delete).toBe('function');
  });

  it('works with a mock implementation', async () => {
    const store = new Map<string, SiteToolManifest>();
    const mock: IManifestPersistencePort = {
      save: vi.fn(async (origin, manifest) => { store.set(origin, manifest); }),
      load: vi.fn(async (origin) => store.get(origin) ?? null),
      listOrigins: vi.fn(async () => [...store.keys()]),
      delete: vi.fn(async (origin) => { store.delete(origin); }),
    };

    const manifest = makeManifest('test.com');
    await mock.save('test.com', manifest);
    expect(mock.save).toHaveBeenCalledWith('test.com', manifest);

    const loaded = await mock.load('test.com');
    expect(loaded).toEqual(manifest);
  });
});
