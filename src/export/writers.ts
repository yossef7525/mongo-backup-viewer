import { EJSON, type Document } from 'bson';
import { toPlain } from '../bson/plain';

export type ExportFormat = 'json' | 'ejson' | 'jsonl';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['json', 'ejson', 'jsonl'];

export interface DocWriter {
  begin(): string;
  doc(d: Document): string;
  end(): string;
}

function arrayWriter(stringify: (d: Document) => string): DocWriter {
  let n = 0;
  return {
    begin: () => '[',
    doc: (d) => (n++ ? ',\n' : '\n') + stringify(d),
    end: () => (n ? '\n]\n' : ']\n'),
  };
}

export function createWriter(format: ExportFormat): DocWriter {
  switch (format) {
    case 'json':
      return arrayWriter((d) => JSON.stringify(toPlain(d)));
    case 'ejson':
      return arrayWriter((d) => EJSON.stringify(d, { relaxed: false }));
    case 'jsonl':
      return { begin: () => '', doc: (d) => JSON.stringify(toPlain(d)) + '\n', end: () => '' };
  }
}

export function exportFileInfo(format: ExportFormat): { extension: '.json' | '.jsonl'; mime: string } {
  return format === 'jsonl' ? { extension: '.jsonl', mime: 'application/x-ndjson' } : { extension: '.json', mime: 'application/json' };
}
