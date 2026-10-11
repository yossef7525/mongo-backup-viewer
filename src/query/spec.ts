import JSON5 from 'json5';
import { EJSON, type Document } from 'bson';

export interface QueryInput {
  filter: string;
  projection: string;
  sort: string;
  skip: string;
  limit: string;
}

export const EMPTY_INPUT: QueryInput = { filter: '', projection: '', sort: '', skip: '', limit: '' };

export interface QuerySpec {
  filter: Document;
  projection?: Document;
  sort?: Record<string, 1 | -1>;
  skip: number;
  limit?: number;
}

export type QueryField = keyof QueryInput;
export type QueryError = { code: 'invalidJson'; detail: string } | { code: 'notObject' } | { code: 'invalidNumber' } | { code: 'invalidSort' };
export type ParseResult = { ok: true; spec: QuerySpec } | { ok: false; errors: Partial<Record<QueryField, QueryError>> };

const SHELL_CALL =
  /^(?:new\s+)?(ObjectId|ISODate|Date|NumberLong|NumberInt|NumberDecimal|UUID)\(\s*(?:(["'])((?:\\.|(?!\2).)*)\2|(-?\d+(?:\.\d+)?))?\s*\)/;

function wrapShellCall(fn: string, arg: string | undefined, numeric: boolean): string {
  const s = JSON.stringify(arg ?? '');
  switch (fn) {
    case 'ObjectId':
      return `{"$oid":${s}}`;
    case 'ISODate':
    case 'Date':
      if (arg === undefined) return `{"$date":${JSON.stringify(new Date().toISOString())}}`;
      return numeric ? `{"$date":{"$numberLong":${s}}}` : `{"$date":${s}}`;
    case 'NumberLong':
      return `{"$numberLong":${s}}`;
    case 'NumberInt':
      return `{"$numberInt":${s}}`;
    case 'NumberDecimal':
      return `{"$numberDecimal":${s}}`;
    default:
      return `{"$uuid":${s}}`;
  }
}

/** Rewrites mongo-shell helper calls into Extended JSON, leaving string literals untouched. */
export function shellToJson5(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch) && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
      const m = SHELL_CALL.exec(text.slice(i));
      if (m) {
        out += wrapShellCall(m[1], m[3] ?? m[4], m[4] !== undefined);
        i += m[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

function hasInvalidDate(v: unknown): boolean {
  if (v instanceof Date) return Number.isNaN(v.getTime());
  if (Array.isArray(v)) return v.some(hasInvalidDate);
  if (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.values(v).some(hasInvalidDate);
  }
  return false;
}

type FieldResult<T> = { value: T } | { error: QueryError };

function parseObject(text: string): FieldResult<Document | undefined> {
  if (!text.trim()) return { value: undefined };
  let raw: unknown;
  try {
    raw = JSON5.parse(shellToJson5(text));
  } catch (e) {
    return { error: { code: 'invalidJson', detail: (e as Error).message } };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { error: { code: 'notObject' } };
  try {
    const value = EJSON.deserialize(raw as Document, { relaxed: true }) as Document;
    if (hasInvalidDate(value)) return { error: { code: 'invalidJson', detail: 'Invalid date' } };
    return { value };
  } catch (e) {
    return { error: { code: 'invalidJson', detail: (e as Error).message } };
  }
}

function parseCount(text: string): FieldResult<number | undefined> {
  const t = text.trim();
  if (!t) return { value: undefined };
  return /^\d+$/.test(t) ? { value: Number(t) } : { error: { code: 'invalidNumber' } };
}

export function parseQuerySpec(input: QueryInput): ParseResult {
  const errors: Partial<Record<QueryField, QueryError>> = {};
  const take = <T>(field: QueryField, r: FieldResult<T>): T | undefined => {
    if ('error' in r) {
      errors[field] = r.error;
      return undefined;
    }
    return r.value;
  };

  const filter = take('filter', parseObject(input.filter));
  const projection = take('projection', parseObject(input.projection));
  const sortRaw = take('sort', parseObject(input.sort));
  const skip = take('skip', parseCount(input.skip));
  const limit = take('limit', parseCount(input.limit));

  let sort: Record<string, 1 | -1> | undefined;
  if (sortRaw) {
    if (Object.values(sortRaw).every((v) => v === 1 || v === -1)) sort = sortRaw as Record<string, 1 | -1>;
    else errors.sort = { code: 'invalidSort' };
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  const spec: QuerySpec = { filter: filter ?? {}, skip: skip ?? 0 };
  if (projection && Object.keys(projection).length) spec.projection = projection;
  if (sort && Object.keys(sort).length) spec.sort = sort;
  if (limit !== undefined && limit > 0) spec.limit = limit;
  return { ok: true, spec };
}
