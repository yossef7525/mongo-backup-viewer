import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { Decimal128, ObjectId } from 'bson';
import { encodeArchive } from '../archive/testing/encodeArchive';
import { EMPTY_INPUT } from '../query/spec';
import { createBackend } from './backend';
import { BackendClient, isAborted, type WorkerLike } from './client';
import type { Response } from './protocol';

function connect() {
  const worker: WorkerLike = { onmessage: null, postMessage: (msg) => void backend.handle(msg as never) };
  const backend = createBackend((msg: Response) => queueMicrotask(() => worker.onmessage?.({ data: msg } as MessageEvent)));
  return new BackendClient(worker);
}

const docs = Array.from({ length: 30000 }, (_, i) => ({ _id: new ObjectId(), i, price: Decimal128.fromString(`${i}.25`), city: i % 2 ? 'Haifa' : 'Eilat' }));
const file = new File([gzipSync(encodeArchive([{ db: 'shop', collection: 'orders', docs }, { db: 'shop', collection: 'empty', docs: [] }]))], 'shop-1.gz');

describe('backend', () => {
  it('opens, queries, pages and exports', async () => {
    const client = connect();
    const progress: number[] = [];
    const { archive } = await client.call({ type: 'open', archiveId: 7, file }, { onProgress: (d) => progress.push(d) }).promise;
    expect(progress.length).toBeGreaterThan(0);
    expect(archive).toMatchObject({ archiveId: 7, fileName: 'shop-1.gz', db: 'shop', serverVersion: '8.2.7', error: null });
    expect(archive.collections.map((c) => [c.key, c.count, c.complete])).toEqual([
      ['7/shop.empty', 0, true],
      ['7/shop.orders', 30000, true],
    ]);

    const input = { ...EMPTY_INPUT, filter: `{city: 'Haifa', price: {$lt: 100}}`, sort: '{i: -1}' };
    const q = await client.call({ type: 'query', key: '7/shop.orders', input }).promise;
    expect(q).toMatchObject({ matched: 50, returned: 50 });

    const page = await client.call({ type: 'page', key: '7/shop.orders', input, offset: 10, size: 5 }).promise;
    expect(page.docs.map((d) => d.i)).toEqual([79, 77, 75, 73, 71]);
    expect(page.docs[0]._id).toHaveProperty('$oid');
    expect(page.docs[0].price).toEqual({ $numberDecimal: '79.25' });

    const chunks: string[] = [];
    const ex = await client.call({ type: 'export', key: '7/shop.orders', input, format: 'json', target: null }, { onChunk: (t) => chunks.push(t) }).promise;
    expect(ex.count).toBe(50);
    const exported = JSON.parse(chunks.join(''));
    expect(exported).toHaveLength(50);
    expect(exported[0]).toMatchObject({ i: 99, price: '99.25', city: 'Haifa' });
    expect(typeof exported[0]._id).toBe('string');
  });

  it('reports invalid queries and unknown collections', async () => {
    const client = connect();
    await client.call({ type: 'open', archiveId: 1, file }).promise;
    await expect(client.call({ type: 'query', key: '1/shop.orders', input: { ...EMPTY_INPUT, filter: '{' } }).promise).rejects.toMatchObject({ code: 'invalidQuery' });
    await expect(client.call({ type: 'query', key: '9/x.y', input: EMPTY_INPUT }).promise).rejects.toMatchObject({ code: 'notFound' });
  });

  it('cancels a running job', async () => {
    const client = connect();
    await client.call({ type: 'open', archiveId: 2, file }).promise;
    const job = client.call({ type: 'query', key: '2/shop.orders', input: { ...EMPTY_INPUT, filter: '{i: {$gte: 0}}' } });
    client.cancel(job.jobId);
    const err = await job.promise.catch((e) => e);
    expect(isAborted(err)).toBe(true);
  });

  it('close forgets the archive', async () => {
    const client = connect();
    await client.call({ type: 'open', archiveId: 3, file }).promise;
    await client.call({ type: 'close', archiveId: 3 }).promise;
    await expect(client.call({ type: 'query', key: '3/shop.orders', input: EMPTY_INPUT }).promise).rejects.toMatchObject({ code: 'notFound' });
  });
});
