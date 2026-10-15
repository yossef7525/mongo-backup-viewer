import { EJSON, type Document } from 'bson';
import { classifyOpenError, isAbort, isGzip, type OpenedArchive, type OpenedCollection } from './open';
import { nsOf, readBsonDocs, type CollectionMeta, type IndexInfo } from './parser';
import { CollectionStore } from './store';

/** A directory-format dump to open: one `.bson` (plain or gzipped) per collection, plus its optional `.metadata.json`. */
export interface DumpSource {
  name: string;
  collections: { db: string; collection: string; bson: Blob; metadata?: Blob | null }[];
}

type Progress = (readBytes: number, totalBytes: number) => void;

function metaFrom(db: string, collection: string, parsed: Document): CollectionMeta {
  return {
    db,
    collection,
    type: typeof parsed.type === 'string' ? parsed.type : 'collection',
    indexes: Array.isArray(parsed.indexes) ? (parsed.indexes as IndexInfo[]) : [],
    options: parsed.options && typeof parsed.options === 'object' ? (parsed.options as Record<string, unknown>) : {},
  };
}

/** Opens a mongodump --out folder (with or without --gzip) into the same shape openArchive returns. Throws only on abort. */
export async function openDirDump(dump: DumpSource, opts: { signal?: AbortSignal; onProgress?: Progress } = {}): Promise<OpenedArchive> {
  const { signal } = opts;
  signal?.throwIfAborted();
  const total = dump.collections.reduce((n, c) => n + c.bson.size + (c.metadata?.size ?? 0), 0);
  let read = 0;

  // Gzip is detected per file by its magic bytes, not by the .gz extension.
  const contentOf = async (blob: Blob): Promise<ReadableStream<Uint8Array>> => {
    const counted = blob.stream().pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctrl) {
          read += chunk.byteLength;
          opts.onProgress?.(read, total);
          ctrl.enqueue(chunk);
        },
      }),
    );
    if (!(await isGzip(blob))) return counted;
    return counted.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  };

  const readMetadata = async (blob: Blob | null | undefined): Promise<Document> => {
    if (!blob) return {};
    try {
      const parsed: unknown = EJSON.parse(await new Response(await contentOf(blob)).text(), { relaxed: true });
      return parsed && typeof parsed === 'object' ? (parsed as Document) : {};
    } catch (e) {
      if (isAbort(e) || signal?.aborted) throw e;
      return {}; // unreadable metadata only costs the index list
    }
  };

  const result: OpenedArchive = { header: null, db: null, collections: [], error: null };
  for (const c of dump.collections) {
    signal?.throwIfAborted();
    const opened: OpenedCollection = {
      ns: nsOf(c.db, c.collection),
      meta: metaFrom(c.db, c.collection, await readMetadata(c.metadata)),
      store: new CollectionStore(),
      complete: false,
    };
    result.collections.push(opened);
    try {
      await readBsonDocs(await contentOf(c.bson), (bson) => opened.store.append(bson), signal);
      opened.complete = true;
    } catch (e) {
      if (isAbort(e) || signal?.aborted) throw e;
      result.error ??= classifyOpenError(e);
    }
  }

  result.collections.sort((a, b) => a.meta.db.localeCompare(b.meta.db) || a.meta.collection.localeCompare(b.meta.collection));
  const dbs = new Set(result.collections.map((c) => c.meta.db));
  result.db = dbs.size === 1 ? [...dbs][0] : null;
  return result;
}
