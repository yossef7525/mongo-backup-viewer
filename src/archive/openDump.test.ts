import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { serialize } from 'bson';
import { openDirDump } from './openDump';
import { encodeBsonFile, encodeMetadataFile } from './testing/encodeDump';

const file = (b: Uint8Array, name: string) => new File([b as BlobPart], name);
const many = Array.from({ length: 5000 }, (_, i) => ({ _id: i, s: `row ${i}` }));
const idx = [
  { v: 2, key: { _id: 1 }, name: '_id_' },
  { v: 2, key: { s: 1 }, name: 's_1', unique: true },
];

describe('openDirDump', () => {
  it('opens plain and gzipped collections of one database, with metadata', async () => {
    const orders = encodeBsonFile(many);
    const progress: [number, number][] = [];
    const dump = {
      name: 'dump',
      collections: [
        { db: 'shop', collection: 'users', bson: file(encodeBsonFile([{ _id: 1 }, { _id: 2 }]), 'users.bson'), metadata: file(encodeMetadataFile('users', idx, { capped: true, size: 4096 }), 'users.metadata.json') },
        // gzip is detected by content, not by name
        { db: 'shop', collection: 'orders', bson: file(gzipSync(orders), 'orders.bson'), metadata: file(gzipSync(encodeMetadataFile('orders', idx)), 'orders.metadata.json.gz') },
        { db: 'shop', collection: 'empty', bson: file(new Uint8Array(), 'empty.bson'), metadata: null },
      ],
    };
    const a = await openDirDump(dump, { onProgress: (r, t) => progress.push([r, t]) });
    expect(a.error).toBeNull();
    expect(a.header).toBeNull();
    expect(a.db).toBe('shop');
    expect(a.collections.map((c) => [c.ns, c.store.count, c.complete])).toEqual([
      ['shop.empty', 0, true],
      ['shop.orders', 5000, true],
      ['shop.users', 2, true],
    ]);
    expect(a.collections[1].store.get(4999)).toEqual({ _id: 4999, s: 'row 4999' });
    expect(a.collections[1].meta.indexes.map((i) => i.name)).toEqual(['_id_', 's_1']);
    expect(a.collections[2].meta.options).toEqual({ capped: true, size: 4096 });
    expect(a.collections[0].meta).toMatchObject({ db: 'shop', collection: 'empty', type: 'collection', indexes: [] });
    const total = dump.collections.reduce((n, c) => n + c.bson.size + (c.metadata?.size ?? 0), 0);
    expect(progress.at(-1)).toEqual([total, total]);
  });

  it('reports db null for several databases and sorts by ns', async () => {
    const a = await openDirDump({
      name: 'all',
      collections: [
        { db: 'shop', collection: 'a', bson: file(encodeBsonFile([{ _id: 1 }]), 'a.bson') },
        { db: 'admin', collection: 'system.version', bson: file(encodeBsonFile([{ _id: 'v' }]), 'system.version.bson') },
      ],
    });
    expect(a.db).toBeNull();
    expect(a.collections.map((c) => c.ns)).toEqual(['admin.system.version', 'shop.a']);
  });

  it('marks a truncated collection incomplete and keeps going', async () => {
    const full = encodeBsonFile(many);
    const a = await openDirDump({
      name: 'd',
      collections: [
        { db: 'x', collection: 'cut', bson: file(full.subarray(0, full.length - 3), 'cut.bson') },
        { db: 'x', collection: 'ok', bson: file(encodeBsonFile([{ _id: 1 }]), 'ok.bson') },
      ],
    });
    expect(a.error?.code).toBe('truncated');
    expect(a.collections.map((c) => [c.ns, c.store.count, c.complete])).toEqual([
      ['x.cut', 4999, false],
      ['x.ok', 1, true],
    ]);
  });

  it('reports a corrupt document size with its offset', async () => {
    const first = serialize({ _id: 1 });
    const bad = new Uint8Array([...first, 1, 0, 0, 0, 0]);
    const a = await openDirDump({ name: 'd', collections: [{ db: 'x', collection: 'bad', bson: file(bad, 'bad.bson') }] });
    expect(a.error).toMatchObject({ code: 'corrupt', offset: first.length });
    expect(a.collections[0]).toMatchObject({ complete: false });
    expect(a.collections[0].store.count).toBe(1);
  });

  it('reports a truncated gzip stream', async () => {
    const gz = gzipSync(encodeBsonFile(many));
    const a = await openDirDump({ name: 'd', collections: [{ db: 'x', collection: 'y', bson: file(gz.subarray(0, gz.length >> 1), 'y.bson.gz') }] });
    expect(a.error?.code).toBe('truncated');
    expect(a.collections[0].complete).toBe(false);
  });

  it('falls back to no indexes when metadata is unreadable', async () => {
    const a = await openDirDump({
      name: 'd',
      collections: [{ db: 'x', collection: 'y', bson: file(encodeBsonFile([{ _id: 1 }]), 'y.bson'), metadata: file(new TextEncoder().encode('{nope'), 'y.metadata.json') }],
    });
    expect(a.error).toBeNull();
    expect(a.collections[0].meta).toMatchObject({ indexes: [], options: {}, type: 'collection' });
  });

  it('throws on abort', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(openDirDump({ name: 'd', collections: [{ db: 'x', collection: 'y', bson: file(encodeBsonFile(many), 'y.bson') }] }, { signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
