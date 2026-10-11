import { EJSON } from 'bson';
import { openArchive, type OpenedArchive, type OpenedCollection } from '../archive/open';
import { createWriter } from '../export/writers';
import { executeQuery, materialize, type QueryResult } from '../query/engine';
import { parseQuerySpec, type QueryInput, type QuerySpec } from '../query/spec';
import { SAMPLE_SIZE, samplePaths, type FieldPath } from './fields';
import type { ArchiveSummary, Request, Response } from './protocol';

class BackendFailure extends Error {
  constructor(
    readonly code: 'notFound' | 'invalidQuery',
    message: string,
  ) {
    super(message);
  }
}

export interface TextSink {
  write(text: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export async function fileSink(handle: FileSystemFileHandle): Promise<TextSink> {
  const ws = await handle.createWritable();
  return { write: (t) => ws.write(t), close: () => ws.close(), abort: () => ws.abort() };
}

export function chunkSink(emit: (text: string) => void): TextSink {
  return {
    write: async (t) => {
      if (t) emit(t);
    },
    close: async () => {},
    abort: async () => {},
  };
}

export function summarize(archiveId: number, fileName: string, a: OpenedArchive): ArchiveSummary {
  return {
    archiveId,
    fileName,
    db: a.db,
    serverVersion: a.header?.server_version ?? null,
    error: a.error,
    collections: a.collections.map((c) => ({
      key: `${archiveId}/${c.ns}`,
      db: c.meta.db,
      name: c.meta.collection,
      count: c.store.count,
      bytes: c.store.bytes,
      complete: c.complete,
      indexes: c.meta.indexes,
    })),
  };
}

const PROGRESS_EVERY = 1000;
const FLUSH_AT = 1 << 20;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function createBackend(post: (msg: Response) => void) {
  const archives = new Map<number, OpenedArchive>();
  const jobs = new Map<number, AbortController>();
  const cache = new Map<string, { inputKey: string; spec: QuerySpec; result: QueryResult }>();
  const fieldCache = new Map<string, FieldPath[]>();

  const collection = (key: string): OpenedCollection => {
    const slash = key.indexOf('/');
    const found = archives.get(Number(key.slice(0, slash)))?.collections.find((c) => c.ns === key.slice(slash + 1));
    if (!found) throw new BackendFailure('notFound', `Unknown collection ${key}`);
    return found;
  };

  async function query(key: string, input: QueryInput, jobId: number, signal: AbortSignal) {
    const inputKey = JSON.stringify(input);
    const hit = cache.get(key);
    if (hit && hit.inputKey === inputKey) return hit;
    const store = collection(key).store;
    const parsed = parseQuerySpec(input);
    if (!parsed.ok) throw new BackendFailure('invalidQuery', JSON.stringify(parsed.errors));
    const result = await executeQuery(store, parsed.spec, {
      signal,
      onProgress: (done, total) => post({ type: 'progress', jobId, done, total }),
    });
    const entry = { inputKey, spec: parsed.spec, result };
    cache.set(key, entry);
    return entry;
  }

  async function run(req: Exclude<Request, { type: 'cancel' }>, signal: AbortSignal): Promise<void> {
    const { jobId } = req;
    switch (req.type) {
      case 'open': {
        const opened = await openArchive(req.file, {
          signal,
          onProgress: (done, total) => post({ type: 'progress', jobId, done, total }),
        });
        archives.set(req.archiveId, opened);
        post({ type: 'opened', jobId, archive: summarize(req.archiveId, req.file.name, opened) });
        return;
      }
      case 'close': {
        archives.delete(req.archiveId);
        for (const c of [cache, fieldCache]) for (const k of [...c.keys()]) if (k.startsWith(`${req.archiveId}/`)) c.delete(k);
        post({ type: 'closed', jobId });
        return;
      }
      case 'query': {
        const { result } = await query(req.key, req.input, jobId, signal);
        post({ type: 'queried', jobId, matched: result.matched, returned: result.indices.length });
        return;
      }
      case 'page': {
        const { spec, result } = await query(req.key, req.input, jobId, signal);
        const store = collection(req.key).store;
        const docs = Array.from(result.indices.subarray(req.offset, req.offset + req.size), (i) =>
          EJSON.serialize(materialize(store, i, spec.projection), { relaxed: true }),
        );
        post({ type: 'page', jobId, offset: req.offset, docs });
        return;
      }
      case 'fields': {
        let paths = fieldCache.get(req.key);
        if (!paths) {
          const store = collection(req.key).store;
          const n = Math.min(SAMPLE_SIZE, store.count);
          paths = samplePaths(Array.from({ length: n }, (_, i) => store.get(i)));
          fieldCache.set(req.key, paths);
        }
        post({ type: 'fields', jobId, paths });
        return;
      }
      case 'export': {
        const { spec, result } = await query(req.key, req.input, jobId, signal);
        const store = collection(req.key).store;
        const sink = req.target ? await fileSink(req.target) : chunkSink((text) => post({ type: 'chunk', jobId, text }));
        const writer = createWriter(req.format);
        const total = result.indices.length;
        try {
          let buf = writer.begin();
          for (let n = 0; n < total; n++) {
            if (n % PROGRESS_EVERY === 0) {
              signal.throwIfAborted();
              post({ type: 'progress', jobId, done: n, total });
              await tick();
            }
            buf += writer.doc(materialize(store, result.indices[n], spec.projection));
            if (buf.length >= FLUSH_AT) {
              await sink.write(buf);
              buf = '';
            }
          }
          signal.throwIfAborted();
          await sink.write(buf + writer.end());
          await sink.close();
        } catch (e) {
          await sink.abort().catch(() => {});
          throw e;
        }
        post({ type: 'exported', jobId, count: total });
        return;
      }
    }
  }

  return {
    async handle(req: Request): Promise<void> {
      if (req.type === 'cancel') {
        jobs.get(req.target)?.abort();
        return;
      }
      const ac = new AbortController();
      jobs.set(req.jobId, ac);
      try {
        await run(req, ac.signal);
      } catch (e) {
        const aborted = ac.signal.aborted || (e as Error)?.name === 'AbortError';
        post({
          type: 'error',
          jobId: req.jobId,
          code: aborted ? 'aborted' : e instanceof BackendFailure ? e.code : 'failed',
          message: (e as Error)?.message ?? String(e),
        });
      } finally {
        jobs.delete(req.jobId);
      }
    },
  };
}
