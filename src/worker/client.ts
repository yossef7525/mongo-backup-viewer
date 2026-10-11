import type { ReplyMap, Request, Response } from './protocol';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type Call = DistributiveOmit<Exclude<Request, { type: 'cancel' }>, 'jobId'>;

export interface WorkerLike {
  postMessage(msg: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror?: ((e: ErrorEvent) => void) | null;
  onmessageerror?: ((e: MessageEvent) => void) | null;
}

export class BackendError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = code === 'aborted' ? 'AbortError' : 'BackendError';
  }
}

export const isAborted = (e: unknown) => e instanceof BackendError && e.code === 'aborted';

interface Handlers {
  onProgress?(done: number, total: number): void;
  onChunk?(text: string): void;
}

interface Pending extends Handlers {
  resolve(v: unknown): void;
  reject(e: unknown): void;
}

/** Main-thread RPC over the worker protocol. */
export class BackendClient {
  private next = 1;
  private pending = new Map<number, Pending>();

  constructor(private worker: WorkerLike) {
    worker.onmessage = (e) => this.receive(e.data as Response);
    worker.onerror = (e) => this.failAll((e as ErrorEvent | undefined)?.message || 'Worker failed');
    worker.onmessageerror = () => this.failAll('Worker failed');
  }

  private failAll(message: string): void {
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const p of all) p.reject(new BackendError('failed', message));
  }

  call<C extends Call>(req: C, handlers: Handlers = {}): { jobId: number; promise: Promise<ReplyMap[C['type']]> } {
    const jobId = this.next++;
    const promise = new Promise<ReplyMap[C['type']]>((resolve, reject) => {
      this.pending.set(jobId, { resolve: resolve as (v: unknown) => void, reject, ...handlers });
    });
    try {
      this.worker.postMessage({ ...req, jobId });
    } catch (err) {
      const p = this.pending.get(jobId);
      this.pending.delete(jobId);
      p?.reject(new BackendError('failed', (err as Error)?.message ?? String(err)));
    }
    return { jobId, promise };
  }

  cancel(jobId: number): void {
    if (this.pending.has(jobId)) this.worker.postMessage({ type: 'cancel', jobId: 0, target: jobId });
  }

  private receive(msg: Response): void {
    const p = this.pending.get(msg.jobId);
    if (!p) return;
    switch (msg.type) {
      case 'progress':
        p.onProgress?.(msg.done, msg.total);
        return;
      case 'chunk':
        p.onChunk?.(msg.text);
        return;
      case 'error':
        this.pending.delete(msg.jobId);
        p.reject(new BackendError(msg.code, msg.message));
        return;
      default:
        this.pending.delete(msg.jobId);
        p.resolve(msg);
    }
  }
}
