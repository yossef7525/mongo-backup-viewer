import { describe, expect, it } from 'vitest';
import { deserialize, ObjectId, serialize, type Document } from 'bson';
import { ArchiveFormatError, parseArchive, readBsonDocs, type ArchiveSink, type CollectionMeta } from './parser';
import { encodeBsonFile } from './testing/encodeDump';
import { encodeArchive, streamOf, type FixtureCollection } from './testing/encodeArchive';

function collector() {
  const metas: CollectionMeta[] = [];
  const docs = new Map<string, Document[]>();
  const eofs: string[] = [];
  let header: unknown = null;
  let lastProgress = 0;
  const sink: ArchiveSink = {
    header: (h) => (header = h),
    collection: (m) => metas.push(m),
    doc: (ns, b) => {
      const list = docs.get(ns) ?? [];
      list.push(deserialize(b.slice()));
      docs.set(ns, list);
    },
    eof: (ns) => eofs.push(ns),
    progress: (n) => (lastProgress = n),
  };
  return { sink, metas, docs, eofs, get header() { return header; }, get progress() { return lastProgress; } };
}

const people: FixtureCollection = {
  db: 'shop',
  collection: 'people',
  docs: Array.from({ length: 25 }, (_, i) => ({ _id: new ObjectId(), n: i, name: `p${i}` })),
  indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }, { v: 2, key: { name: 1 }, name: 'name_1', unique: true }],
};
const orders: FixtureCollection = {
  db: 'shop',
  collection: 'orders',
  docs: Array.from({ length: 7 }, (_, i) => ({ _id: i, total: i * 10, at: new Date(2026, 0, i + 1) })),
};
const empty: FixtureCollection = { db: 'shop', collection: 'empty', docs: [] };

describe('parseArchive', () => {
  it('parses header, metadata, documents and EOFs', async () => {
    const bytes = encodeArchive([people, orders, empty]);
    const c = collector();
    await parseArchive(streamOf(bytes), c.sink);
    expect(c.header).toMatchObject({ version: '0.1', server_version: '8.2.7' });
    expect(c.metas.map((m) => m.collection)).toEqual(['people', 'orders', 'empty']);
    expect(c.metas[0].indexes.map((i) => i.name)).toEqual(['_id_', 'name_1']);
    expect(c.metas[0].indexes[1]).toMatchObject({ key: { name: 1 }, unique: true });
    expect(c.docs.get('shop.people')?.length).toBe(25);
    expect(c.docs.get('shop.orders')?.[3]).toMatchObject({ _id: 3, total: 30 });
    expect(c.docs.has('shop.empty')).toBe(false);
    expect(c.eofs.sort()).toEqual(['shop.empty', 'shop.orders', 'shop.people']);
    expect(c.progress).toBe(bytes.length);
  });

  it('handles interleaved segments', async () => {
    const bytes = encodeArchive([people, orders], { segmentSize: 3, interleave: true });
    const c = collector();
    await parseArchive(streamOf(bytes), c.sink);
    expect(c.docs.get('shop.people')?.map((d) => d.n)).toEqual(people.docs.map((d) => d.n));
    expect(c.docs.get('shop.orders')?.length).toBe(7);
  });

  it('is independent of chunk boundaries', async () => {
    const bytes = encodeArchive([people, orders, empty], { segmentSize: 4, interleave: true });
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % 37) + 1;
    for (const chunk of [1, 3, 7, 64, rnd]) {
      const c = collector();
      await parseArchive(streamOf(bytes, chunk), c.sink);
      expect(c.docs.get('shop.people')?.length).toBe(25);
      expect(c.docs.get('shop.orders')?.length).toBe(7);
      expect(c.eofs.length).toBe(3);
    }
  });

  it('rejects bad magic with notArchive', async () => {
    const c = collector();
    const err = await parseArchive(streamOf(new TextEncoder().encode('{"hello": "world"}')), c.sink).catch((e) => e);
    expect(err).toBeInstanceOf(ArchiveFormatError);
    expect(err.code).toBe('notArchive');
  });

  it('reports truncation and keeps what was read', async () => {
    const bytes = encodeArchive([people, orders]);
    const c = collector();
    const err = await parseArchive(streamOf(bytes.subarray(0, bytes.length - 40)), c.sink).catch((e) => e);
    expect(err).toBeInstanceOf(ArchiveFormatError);
    expect(err.code).toBe('truncated');
    expect(c.docs.get('shop.people')?.length).toBe(25);
  });

  it('flags an impossible document size as corrupt', async () => {
    const bytes = encodeArchive([orders]).slice();
    // Corrupt the first body document length: find the first namespace header after the metadata terminator.
    const view = new DataView(bytes.buffer);
    let o = 4;
    o += view.getInt32(o, true); // header
    o += view.getInt32(o, true); // one metadata doc
    o += 4; // terminator
    o += view.getInt32(o, true); // namespace header
    view.setInt32(o, 2, true);
    const err = await parseArchive(streamOf(bytes), collector().sink).catch((e) => e);
    expect(err).toBeInstanceOf(ArchiveFormatError);
    expect(err.code).toBe('corrupt');
    expect(err.offset).toBe(o);
  });

  it('stops when aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const err = await parseArchive(streamOf(encodeArchive([people])), collector().sink, ac.signal).catch((e) => e);
    expect(err.name).toBe('AbortError');
  });

  it('flags malformed BSON inside a correctly sized document as corrupt', async () => {
    const bytes = encodeArchive([orders]).slice();
    const view = new DataView(bytes.buffer);
    const metaStart = 4 + view.getInt32(4, true);
    bytes[metaStart + 4] = 0xff; // invalid element type, length prefix untouched
    const err = await parseArchive(streamOf(bytes), collector().sink).catch((e) => e);
    expect(err).toBeInstanceOf(ArchiveFormatError);
    expect(err.code).toBe('corrupt');
    expect(err.offset).toBe(metaStart);
  });

  it('still reports a collection whose metadata is not valid EJSON', async () => {
    const u32 = (n: number) => {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, n, true);
      return b;
    };
    const parts = [
      u32(0x8199e26d),
      serialize({ version: '0.1' }),
      serialize({ db: 'd', collection: 'c', metadata: 'not json{', size: 0, type: 'collection' }),
      u32(0xffffffff),
      serialize({ db: 'd', collection: 'c', EOF: true, CRC: 0 }),
      u32(0xffffffff),
    ];
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      bytes.set(p, o);
      o += p.length;
    }
    const c = collector();
    await parseArchive(streamOf(bytes), c.sink);
    expect(c.metas).toEqual([{ db: 'd', collection: 'c', type: 'collection', indexes: [], options: {} }]);
    expect(c.eofs).toEqual(['d.c']);
  });
});

describe('readBsonDocs', () => {
  const docs = Array.from({ length: 300 }, (_, i) => ({ _id: i, s: 'x'.repeat(i % 37) }));
  const bytes = encodeBsonFile(docs);

  it('reads concatenated documents independent of chunk boundaries', async () => {
    for (const size of [1, 3, 64, () => 1 + Math.floor(Math.random() * 200)]) {
      const got: Document[] = [];
      await readBsonDocs(streamOf(bytes, size), (b) => got.push(deserialize(b.slice())));
      expect(got).toEqual(docs);
    }
  });

  it('reports a trailing partial document as truncated', async () => {
    let n = 0;
    const err = await readBsonDocs(streamOf(bytes.subarray(0, bytes.length - 2), 7), () => n++).catch((e) => e);
    expect(err).toBeInstanceOf(ArchiveFormatError);
    expect(err).toMatchObject({ code: 'truncated' });
    expect(n).toBe(docs.length - 1);
  });

  it('flags an impossible document size as corrupt', async () => {
    const err = await readBsonDocs(streamOf(new Uint8Array([0xff, 0xff, 0xff, 0x7f, 0])), () => {}).catch((e) => e);
    expect(err).toMatchObject({ code: 'corrupt', offset: 0 });
  });
});
