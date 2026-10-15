import { deserialize, EJSON, type Document } from 'bson';
import { ByteQueue } from './byteQueue';

export const ARCHIVE_MAGIC = 0x8199e26d;
const TERMINATOR = 0xffffffff;
const MAX_DOC_SIZE = 64 * 1024 * 1024;

export interface ArchiveHeader {
  concurrent_collections?: number;
  version?: string;
  server_version?: string;
  tool_version?: string;
}

export interface IndexInfo {
  name: string;
  key: Record<string, unknown>;
  [option: string]: unknown;
}

export interface CollectionMeta {
  db: string;
  collection: string;
  type: string;
  indexes: IndexInfo[];
  options: Record<string, unknown>;
}

export interface ArchiveSink {
  header(h: ArchiveHeader): void;
  collection(meta: CollectionMeta): void;
  /** `bson` may be a view into a stream chunk; copy it if you keep it. */
  doc(ns: string, bson: Uint8Array): void;
  eof(ns: string): void;
  progress?(consumedBytes: number): void;
}

export type ArchiveFormatErrorCode = 'notArchive' | 'truncated' | 'corrupt';

export class ArchiveFormatError extends Error {
  constructor(
    readonly code: ArchiveFormatErrorCode,
    message: string,
    readonly offset: number,
  ) {
    super(message);
    this.name = 'ArchiveFormatError';
  }
}

export const nsOf = (db: string, collection: string) => `${db}.${collection}`;

type State = 'magic' | 'header' | 'meta' | 'segmentHeader' | 'segmentDocs';

function toMeta(raw: Document): CollectionMeta {
  let parsed: Document = {};
  try {
    if (typeof raw.metadata === 'string' && raw.metadata) parsed = EJSON.parse(raw.metadata, { relaxed: true }) as Document;
  } catch {
    parsed = {};
  }
  return {
    db: String(raw.db),
    collection: String(raw.collection),
    type: String(raw.type ?? 'collection'),
    indexes: Array.isArray(parsed.indexes) ? (parsed.indexes as IndexInfo[]) : [],
    options: (parsed.options as Record<string, unknown>) ?? {},
  };
}

/** Streams a (decompressed) mongodump archive and reports its structure to `sink`. */
export async function parseArchive(stream: ReadableStream<Uint8Array>, sink: ArchiveSink, signal?: AbortSignal): Promise<void> {
  const q = new ByteQueue();
  let state = 'magic' as State; // mutated inside pump(); assertion stops TS narrowing it to 'magic'
  let ns = '';

  const nextDoc = (): Uint8Array | null => {
    if (q.length < 4) return null;
    const size = q.peekInt32();
    if (size < 5 || size > MAX_DOC_SIZE) throw new ArchiveFormatError('corrupt', `Invalid BSON document size ${size}`, q.consumed);
    if (q.length < size) return null;
    return q.take(size);
  };
  const decode = (b: Uint8Array): Document => {
    try {
      return deserialize(b);
    } catch (e) {
      throw new ArchiveFormatError('corrupt', `Malformed BSON document: ${e instanceof Error ? e.message : String(e)}`, q.consumed - b.length);
    }
  };
  const atTerminator = () => q.peekUint32() === TERMINATOR;

  const pump = () => {
    for (;;) {
      switch (state) {
        case 'magic':
          if (q.length < 4) return;
          if (q.peekUint32() !== ARCHIVE_MAGIC) throw new ArchiveFormatError('notArchive', 'Not a mongodump archive', 0);
          q.skip(4);
          state = 'header';
          break;
        case 'header': {
          const b = nextDoc();
          if (!b) return;
          sink.header(decode(b) as ArchiveHeader);
          state = 'meta';
          break;
        }
        case 'meta': {
          if (q.length < 4) return;
          if (atTerminator()) {
            q.skip(4);
            state = 'segmentHeader';
            break;
          }
          const b = nextDoc();
          if (!b) return;
          sink.collection(toMeta(decode(b)));
          break;
        }
        case 'segmentHeader': {
          const b = nextDoc();
          if (!b) return;
          const h = decode(b);
          ns = nsOf(String(h.db), String(h.collection));
          if (h.EOF === true) sink.eof(ns);
          state = 'segmentDocs';
          break;
        }
        case 'segmentDocs': {
          if (q.length < 4) return;
          if (atTerminator()) {
            q.skip(4);
            state = 'segmentHeader';
            break;
          }
          const b = nextDoc();
          if (!b) return;
          sink.doc(ns, b);
          break;
        }
      }
    }
  };

  const reader = stream.getReader();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      q.push(value);
      pump();
      sink.progress?.(q.consumed);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  signal?.throwIfAborted();
  if (state !== 'segmentHeader' || q.length > 0) {
    throw new ArchiveFormatError('truncated', 'Archive ended unexpectedly', q.consumed);
  }
}

/**
 * Streams back-to-back BSON documents (a mongodump `--out` `.bson` file, already decompressed) to `onDoc`.
 * `bson` may be a view into a stream chunk; copy it if you keep it. Throws ArchiveFormatError on a bad size or a partial last document.
 */
export async function readBsonDocs(stream: ReadableStream<Uint8Array>, onDoc: (bson: Uint8Array) => void, signal?: AbortSignal): Promise<void> {
  const q = new ByteQueue();
  const reader = stream.getReader();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      q.push(value);
      while (q.length >= 4) {
        const size = q.peekInt32();
        if (size < 5 || size > MAX_DOC_SIZE) throw new ArchiveFormatError('corrupt', `Invalid BSON document size ${size}`, q.consumed);
        if (q.length < size) break;
        onDoc(q.take(size));
      }
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  signal?.throwIfAborted();
  if (q.length > 0) throw new ArchiveFormatError('truncated', 'File ended in the middle of a document', q.consumed);
}
