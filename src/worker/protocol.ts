import type { OpenError } from '../archive/open';
import type { IndexInfo } from '../archive/parser';
import type { ExportFormat } from '../export/writers';
import type { QueryInput } from '../query/spec';
import type { FieldPath } from './fields';

export interface CollectionSummary {
  key: string;
  db: string;
  name: string;
  count: number;
  bytes: number;
  complete: boolean;
  indexes: IndexInfo[];
}

export type SummaryError = OpenError;

export interface ArchiveSummary {
  archiveId: number;
  fileName: string;
  db: string | null;
  serverVersion: string | null;
  collections: CollectionSummary[];
  error: SummaryError | null;
}

/** A mongodump --out folder, grouped on the main thread (see groupInputs). */
export interface DumpRequest {
  name: string;
  collections: { db: string; collection: string; bson: File; metadata: File | null }[];
}

type Req<T extends string, B = object> = { type: T; jobId: number } & B;

export type Request =
  | Req<'open', { archiveId: number; file: File }>
  | Req<'openDump', { archiveId: number; dump: DumpRequest }>
  | Req<'close', { archiveId: number }>
  | Req<'query', { key: string; input: QueryInput }>
  | Req<'page', { key: string; input: QueryInput; offset: number; size: number }>
  | Req<'fields', { key: string }>
  | Req<'export', { key: string; input: QueryInput; format: ExportFormat; target: FileSystemFileHandle | null }>
  | Req<'cancel', { target: number }>;

export type Reply =
  | { type: 'opened'; jobId: number; archive: ArchiveSummary }
  | { type: 'closed'; jobId: number }
  | { type: 'queried'; jobId: number; matched: number; returned: number }
  | { type: 'page'; jobId: number; offset: number; docs: Record<string, unknown>[] }
  | { type: 'fields'; jobId: number; paths: FieldPath[] }
  | { type: 'exported'; jobId: number; count: number };

export type Response =
  | Reply
  | { type: 'progress'; jobId: number; done: number; total: number }
  | { type: 'chunk'; jobId: number; text: string }
  | { type: 'error'; jobId: number; code: 'aborted' | 'notFound' | 'invalidQuery' | 'failed'; message: string };

export interface ReplyMap {
  open: Extract<Reply, { type: 'opened' }>;
  openDump: Extract<Reply, { type: 'opened' }>;
  close: Extract<Reply, { type: 'closed' }>;
  query: Extract<Reply, { type: 'queried' }>;
  page: Extract<Reply, { type: 'page' }>;
  fields: Extract<Reply, { type: 'fields' }>;
  export: Extract<Reply, { type: 'exported' }>;
}
