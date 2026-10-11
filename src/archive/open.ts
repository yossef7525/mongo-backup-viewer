import { ArchiveFormatError, nsOf, parseArchive, type ArchiveHeader, type CollectionMeta } from './parser';
import { CollectionStore } from './store';

export type ArchiveErrorCode = 'notGzip' | 'notArchive' | 'truncated' | 'corrupt';

export interface ArchiveError {
  code: ArchiveErrorCode;
  message: string;
  offset?: number;
}

/** Any failure while opening: a format/gzip problem, or something unexpected (e.g. an allocation failure). */
export type OpenError = ArchiveError | { code: 'generic'; message: string };

/** Maps a non-abort failure of the gunzip + parse pipeline to an error shown to the user. */
export function classifyOpenError(e: unknown): OpenError {
  if (e instanceof ArchiveFormatError) return { code: e.code, message: e.message, offset: e.offset };
  // DecompressionStream fails with an (often empty) TypeError on truncated or damaged gzip data.
  if (e instanceof TypeError) return { code: 'truncated', message: e.message || 'Compressed data ended unexpectedly' };
  return { code: 'generic', message: e instanceof Error ? e.message : String(e) };
}

export interface OpenedCollection {
  ns: string;
  meta: CollectionMeta;
  store: CollectionStore;
  complete: boolean;
}

export interface OpenedArchive {
  header: ArchiveHeader | null;
  db: string | null;
  collections: OpenedCollection[];
  error: OpenError | null;
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

async function isGzip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return head[0] === 0x1f && head[1] === 0x8b;
}

/** Decompresses and parses a mongodump --archive --gzip file. Throws only on abort. */
export async function openArchive(
  file: Blob,
  opts: { signal?: AbortSignal; onProgress?(readBytes: number, totalBytes: number): void } = {},
): Promise<OpenedArchive> {
  opts.signal?.throwIfAborted();
  const result: OpenedArchive = { header: null, db: null, collections: [], error: null };
  if (!(await isGzip(file))) {
    result.error = { code: 'notGzip', message: 'File is not gzip-compressed' };
    return result;
  }

  const byNs = new Map<string, OpenedCollection>();
  const ensure = (ns: string, meta?: CollectionMeta): OpenedCollection => {
    let c = byNs.get(ns);
    if (!c) {
      const dot = ns.indexOf('.');
      c = {
        ns,
        meta: meta ?? { db: ns.slice(0, dot), collection: ns.slice(dot + 1), type: 'collection', indexes: [], options: {} },
        store: new CollectionStore(),
        complete: false,
      };
      byNs.set(ns, c);
    }
    return c;
  };

  let read = 0;
  const counted = file.stream().pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        read += chunk.byteLength;
        opts.onProgress?.(read, file.size);
        ctrl.enqueue(chunk);
      },
    }),
  );
  const decompressed = counted.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);

  try {
    await parseArchive(
      decompressed,
      {
        header: (h) => (result.header = h),
        collection: (m) => {
          ensure(nsOf(m.db, m.collection), m);
          result.db ??= m.db;
        },
        doc: (ns, bson) => ensure(ns).store.append(bson),
        eof: (ns) => (ensure(ns).complete = true),
      },
      opts.signal,
    );
  } catch (e) {
    if (isAbort(e) || opts.signal?.aborted) throw e;
    result.error = classifyOpenError(e);
  }

  // Sorted by namespace (db, then collection): an archive made without --db holds every database, admin and config included.
  result.collections = [...byNs.values()].sort((a, b) => a.meta.db.localeCompare(b.meta.db) || a.meta.collection.localeCompare(b.meta.collection));
  result.db ??= result.collections[0]?.meta.db ?? null;
  return result;
}
