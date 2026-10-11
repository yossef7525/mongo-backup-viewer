import { EJSON, serialize, type Document } from 'bson';

export interface FixtureCollection {
  db: string;
  collection: string;
  docs: Document[];
  indexes?: Document[];
}

const MAGIC = 0x8199e26d;
const TERMINATOR = 0xffffffff;

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

/**
 * Builds a mongodump archive (uncompressed) in the same layout mongodump 100.x writes.
 * Used by tests and by scripts/make-demo-archive.ts.
 */
export function encodeArchive(
  colls: FixtureCollection[],
  opts: { segmentSize?: number; interleave?: boolean } = {},
): Uint8Array {
  const parts: Uint8Array[] = [u32(MAGIC)];
  parts.push(serialize({ concurrent_collections: 1, version: '0.1', server_version: '8.2.7', tool_version: '100.8.0' }));
  for (const c of colls) {
    const indexes = c.indexes ?? [{ v: 2, key: { _id: 1 }, name: '_id_' }];
    const metadata = EJSON.stringify({ indexes, uuid: '00000000000000000000000000000000', collectionName: c.collection, type: 'collection' }, { relaxed: false });
    parts.push(serialize({ db: c.db, collection: c.collection, metadata, size: 0, type: 'collection' }));
  }
  parts.push(u32(TERMINATOR));

  const size = opts.segmentSize ?? Number.MAX_SAFE_INTEGER;
  const segments = colls.map((c) => {
    const out: Document[][] = [];
    for (let i = 0; i < c.docs.length; i += size) out.push(c.docs.slice(i, i + size));
    return out;
  });
  const writeSegment = (c: FixtureCollection, docs: Document[]) => {
    parts.push(serialize({ db: c.db, collection: c.collection, EOF: false, CRC: 0 }));
    for (const d of docs) parts.push(serialize(d));
    parts.push(u32(TERMINATOR));
  };
  if (opts.interleave) {
    const max = Math.max(0, ...segments.map((s) => s.length));
    for (let i = 0; i < max; i++) colls.forEach((c, ci) => segments[ci][i] && writeSegment(c, segments[ci][i]));
  } else {
    colls.forEach((c, ci) => segments[ci].forEach((s) => writeSegment(c, s)));
  }
  for (const c of colls) {
    parts.push(serialize({ db: c.db, collection: c.collection, EOF: true, CRC: 0 }));
    parts.push(u32(TERMINATOR));
  }

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Streams bytes in fixed or generated chunk sizes, to exercise chunk-boundary handling. */
export function streamOf(bytes: Uint8Array, chunkSize: number | (() => number) = bytes.length || 1): ReadableStream<Uint8Array> {
  let o = 0;
  return new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (o >= bytes.length) return ctrl.close();
      const n = Math.max(1, typeof chunkSize === 'function' ? chunkSize() : chunkSize);
      ctrl.enqueue(bytes.slice(o, o + n));
      o += n;
    },
  });
}
