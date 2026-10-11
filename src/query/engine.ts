import { Query } from 'mingo';
import type { Document } from 'bson';
import type { CollectionStore } from '../archive/store';
import { toQueryable } from '../bson/plain';
import type { QuerySpec } from './spec';

export interface QueryResult {
  /** Store indices of the result, after sort/skip/limit. */
  indices: Uint32Array;
  /** Number of documents matching the filter, before skip/limit. */
  matched: number;
}

const YIELD_EVERY = 5000;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const ALL = new Query({}, {});

function projectOne(doc: Document, projection: Document): Document {
  return ALL.find<Document>([doc], projection).next() as Document;
}

export async function executeQuery(
  store: CollectionStore,
  spec: QuerySpec,
  opts: { signal?: AbortSignal; onProgress?(done: number, total: number): void } = {},
): Promise<QueryResult> {
  const total = store.count;
  const filterIsEmpty = Object.keys(spec.filter).length === 0;
  const query = new Query(toQueryable(spec.filter), {});
  const sortKeys = spec.sort ? Object.fromEntries(Object.keys(spec.sort).map((k) => [k, 1])) : null;

  const matches: number[] = [];
  const keyDocs: Document[] = [];
  const indexOfKeyDoc = new Map<Document, number>();

  for (let i = 0; i < total; i++) {
    if (i % YIELD_EVERY === 0) {
      opts.signal?.throwIfAborted();
      opts.onProgress?.(i, total);
      await tick();
      opts.signal?.throwIfAborted();
    }
    if (filterIsEmpty && !sortKeys) {
      matches.push(i);
      continue;
    }
    const doc = toQueryable(store.get(i));
    if (!filterIsEmpty && !query.test(doc)) continue;
    matches.push(i);
    if (sortKeys) {
      const keyDoc = projectOne(doc, sortKeys);
      keyDocs.push(keyDoc);
      indexOfKeyDoc.set(keyDoc, i);
    }
  }
  opts.signal?.throwIfAborted();
  opts.onProgress?.(total, total);

  let ordered: number[] = matches;
  if (spec.sort) {
    // mingo returns the same object references, so the Map recovers store indices.
    ordered = ALL.find<Document>(keyDocs).sort(spec.sort).all().map((d) => indexOfKeyDoc.get(d as Document)!);
  }
  const end = spec.limit !== undefined ? spec.skip + spec.limit : undefined;
  return { indices: Uint32Array.from(ordered.slice(spec.skip, end)), matched: matches.length };
}

export function materialize(store: CollectionStore, index: number, projection?: Document): Document {
  const doc = store.get(index);
  return projection ? projectOne(doc, projection) : doc;
}
