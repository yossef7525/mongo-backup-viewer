import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { openArchive } from './open';
import { encodeArchive } from './testing/encodeArchive';

const archive = encodeArchive([
  { db: 'shop', collection: 'zeta', docs: [{ _id: 1 }, { _id: 2 }] },
  { db: 'shop', collection: 'alpha', docs: Array.from({ length: 50 }, (_, i) => ({ _id: i })) },
]);
const blob = (b: Uint8Array) => new Blob([b as BlobPart]);

describe('openArchive', () => {
  it('opens a gzipped archive', async () => {
    const progress: number[] = [];
    const a = await openArchive(blob(gzipSync(archive)), { onProgress: (r) => progress.push(r) });
    expect(a.error).toBeNull();
    expect(a.db).toBe('shop');
    expect(a.header?.server_version).toBe('8.2.7');
    expect(a.collections.map((c) => [c.meta.collection, c.store.count, c.complete])).toEqual([
      ['alpha', 50, true],
      ['zeta', 2, true],
    ]);
    expect(a.collections[0].store.get(49)).toEqual({ _id: 49 });
    expect(progress.at(-1)).toBe(gzipSync(archive).length);
  });

  it('reports notGzip for a plain file', async () => {
    const a = await openArchive(blob(archive));
    expect(a.error?.code).toBe('notGzip');
    expect(a.collections).toEqual([]);
  });

  it('reports notArchive for gzipped non-archive data', async () => {
    const a = await openArchive(blob(gzipSync(new TextEncoder().encode('[{"a":1}]'))));
    expect(a.error?.code).toBe('notArchive');
  });

  it('reports truncated gzip and keeps partial collections', async () => {
    const big = encodeArchive([{ db: 'shop', collection: 'many', docs: Array.from({ length: 20000 }, (_, i) => ({ i, s: `row ${i}` })) }]);
    const gz = gzipSync(big);
    const a = await openArchive(blob(gz.subarray(0, Math.floor(gz.length * 0.6))));
    expect(a.error?.code).toBe('truncated');
    expect(a.collections).toHaveLength(1);
    expect(a.collections[0].complete).toBe(false);
    expect(a.collections[0].store.count).toBeGreaterThan(0);
    expect(a.collections[0].store.count).toBeLessThan(20000);
  });

  it('propagates abort', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(openArchive(blob(gzipSync(archive)), { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
