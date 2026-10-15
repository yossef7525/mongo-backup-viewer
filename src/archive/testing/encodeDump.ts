import { EJSON, serialize, type Document } from 'bson';

/** A `<coll>.bson` file as mongodump --out writes it: the documents' BSON back to back, no header or terminator. */
export function encodeBsonFile(docs: Document[]): Uint8Array {
  const parts = docs.map((d) => serialize(d));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** A `<coll>.metadata.json` file (canonical Extended JSON), as mongodump --out writes it. */
export function encodeMetadataFile(collection: string, indexes: Document[] = [{ v: 2, key: { _id: 1 }, name: '_id_' }], options: Document = {}): Uint8Array {
  const meta = { indexes, uuid: '00000000000000000000000000000000', collectionName: collection, type: 'collection', ...(Object.keys(options).length ? { options } : {}) };
  return new TextEncoder().encode(EJSON.stringify(meta, { relaxed: false }));
}
