import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT } from '../query/spec';
import { BackendClient, type WorkerLike } from './client';

describe('BackendClient failures', () => {
  it('rejects all pending calls when the worker errors', async () => {
    const worker: WorkerLike = { onmessage: null, postMessage: () => {} };
    const client = new BackendClient(worker);
    const a = client.call({ type: 'query', key: '1/a.b', input: EMPTY_INPUT }).promise;
    const b = client.call({ type: 'close', archiveId: 1 }).promise;
    worker.onerror?.({ message: 'boom' } as ErrorEvent);
    await expect(a).rejects.toMatchObject({ code: 'failed', message: 'boom' });
    await expect(b).rejects.toMatchObject({ code: 'failed' });
  });

  it('rejects when postMessage throws', async () => {
    const worker: WorkerLike = {
      onmessage: null,
      postMessage: () => {
        throw new Error('DataCloneError');
      },
    };
    const client = new BackendClient(worker);
    await expect(client.call({ type: 'close', archiveId: 1 }).promise).rejects.toMatchObject({ code: 'failed', message: 'DataCloneError' });
  });
});
