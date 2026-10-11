import { BackendClient } from '../worker/client';

export const backend = new BackendClient(new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' }));
