import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { Decimal128, ObjectId } from 'bson';
import { encodeArchive } from '../archive/testing/encodeArchive';
import { encodeBsonFile, encodeMetadataFile } from '../archive/testing/encodeDump';
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

  it('samples field paths of a collection', async () => {
    const client = connect();
    await client.call({ type: 'open', archiveId: 4, file }).promise;
    const { paths } = await client.call({ type: 'fields', key: '4/shop.orders' }).promise;
    expect(paths).toEqual([
      { path: '_id', types: ['objectId'] },
      { path: 'city', types: ['string'] },
      { path: 'i', types: ['number'] },
      { path: 'price', types: ['decimal'] },
    ]);
    expect((await client.call({ type: 'fields', key: '4/shop.empty' }).promise).paths).toEqual([]);
    await expect(client.call({ type: 'fields', key: '9/x.y' }).promise).rejects.toMatchObject({ code: 'notFound' });
  });

  it('close forgets the archive', async () => {
    const client = connect();
    await client.call({ type: 'open', archiveId: 3, file }).promise;
    await client.call({ type: 'close', archiveId: 3 }).promise;
    await expect(client.call({ type: 'query', key: '3/shop.orders', input: EMPTY_INPUT }).promise).rejects.toMatchObject({ code: 'notFound' });
  });

  it('opens a directory-format dump and serves it like an archive', async () => {
    const client = connect();
    const gz = (b: Uint8Array) => gzipSync(b);
    const dump = {
      name: 'dump',
      collections: [
        { db: 'shop', collection: 'orders', bson: new File([gz(encodeBsonFile(docs))], 'orders.bson.gz'), metadata: new File([gz(encodeMetadataFile('orders'))], 'orders.metadata.json.gz') },
        { db: 'admin', collection: 'system.version', bson: new File([encodeBsonFile([{ _id: 'featureCompatibilityVersion', version: '8.0' }]) as BlobPart], 'system.version.bson'), metadata: null },
      ],
    };
    const progress: number[] = [];
    const { archive } = await client.call({ type: 'openDump', archiveId: 11, dump }, { onProgress: (d) => progress.push(d) }).promise;
    expect(progress.length).toBeGreaterThan(0);
    expect(archive).toMatchObject({ archiveId: 11, fileName: 'dump', db: null, serverVersion: null, error: null });
    expect(archive.collections.map((c) => [c.key, c.db, c.name, c.count, c.complete, c.indexes.map((i) => i.name)])).toEqual([
      ['11/admin.system.version', 'admin', 'system.version', 1, true, []],
      ['11/shop.orders', 'shop', 'orders', 30000, true, ['_id_']],
    ]);

    const input = { ...EMPTY_INPUT, filter: `{city: 'Haifa', price: {$lt: 100}}`, sort: '{i: -1}' };
    expect(await client.call({ type: 'query', key: '11/shop.orders', input }).promise).toMatchObject({ matched: 50, returned: 50 });
    const page = await client.call({ type: 'page', key: '11/shop.orders', input, offset: 0, size: 2 }).promise;
    expect(page.docs.map((d) => d.i)).toEqual([99, 97]);
    const chunks: string[] = [];
    await client.call({ type: 'export', key: '11/admin.system.version', input: EMPTY_INPUT, format: 'jsonl', target: null }, { onChunk: (t) => chunks.push(t) }).promise;
    expect(chunks.join('').trim()).toBe('{"_id":"featureCompatibilityVersion","version":"8.0"}');
    expect((await client.call({ type: 'fields', key: '11/shop.orders' }).promise).paths.map((p) => p.path)).toEqual(['_id', 'city', 'i', 'price']);

    await client.call({ type: 'close', archiveId: 11 }).promise;
    await expect(client.call({ type: 'query', key: '11/shop.orders', input: EMPTY_INPUT }).promise).rejects.toMatchObject({ code: 'notFound' });
  });
});
