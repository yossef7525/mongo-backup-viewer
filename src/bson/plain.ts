import type { Binary, BSONRegExp, Code, Decimal128, DBRef, Long, ObjectId, Timestamp } from 'bson';

const bsonType = (v: object): string | undefined => (v as { _bsontype?: string })._bsontype;

const isPlainObject = (v: object) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function binaryToString(b: Binary): string {
  return b.sub_type === 4 && b.length() === 16 ? b.toUUID().toHexString() : b.toString('base64');
}

/** JS RegExp supports i, m, s, u; MongoDB's x (extended) has no JS equivalent and is dropped. */
const jsFlags = (options: string) => [...new Set(options)].filter((f) => 'imsu'.includes(f)).join('');

export function toPlain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (v instanceof RegExp) return String(v);
  if (Array.isArray(v)) return v.map(toPlain);
  switch (bsonType(v)) {
    case 'ObjectId':
      return (v as ObjectId).toHexString();
    case 'Long': {
      const l = v as Long;
      const n = l.toNumber();
      return Number.isSafeInteger(n) ? n : l.toString();
    }
    case 'Decimal128':
      return (v as Decimal128).toString();
    case 'Int32':
    case 'Double':
      return (v as { valueOf(): number }).valueOf();
    case 'Binary':
      return binaryToString(v as Binary);
    case 'Timestamp':
      return { t: (v as Timestamp).t, i: (v as Timestamp).i };
    case 'BSONRegExp':
      return `/${(v as BSONRegExp).pattern}/${(v as BSONRegExp).options}`;
    case 'MinKey':
      return '$minKey';
    case 'MaxKey':
      return '$maxKey';
    case 'Code':
      return (v as Code).code;
    case 'BSONSymbol':
      return String(v);
    case 'DBRef': {
      const r = v as DBRef;
      return { $ref: r.collection, $id: toPlain(r.oid), ...(r.db ? { $db: r.db } : {}) };
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) out[k] = toPlain(val);
  return out;
}

export function toQueryable<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date || v instanceof RegExp) return v;
  if (Array.isArray(v)) {
    let out: unknown[] | null = null;
    v.forEach((item, i) => {
      const c = toQueryable(item);
      if (c !== item) (out ??= v.slice())[i] = c;
    });
    return (out ?? v) as T;
  }
  switch (bsonType(v)) {
    case 'Long':
      return (v as unknown as Long).toNumber() as T;
    case 'Decimal128':
      return Number((v as unknown as Decimal128).toString()) as T;
    case 'Int32':
    case 'Double':
      return (v as unknown as { valueOf(): number }).valueOf() as T;
    case 'BSONRegExp': {
      const r = v as unknown as BSONRegExp;
      return new RegExp(r.pattern, jsFlags(r.options)) as T;
    }
    case 'Binary':
      return binaryToString(v as unknown as Binary) as T;
    case undefined:
      break;
    default:
      return v; // ObjectId, Timestamp, MinKey, ... are compared as-is
  }
  if (!isPlainObject(v)) return v;
  let out: Record<string, unknown> | null = null;
  for (const [k, val] of Object.entries(v)) {
    const c = toQueryable(val);
    if (c !== val) (out ??= { ...(v as Record<string, unknown>) })[k] = c;
  }
  return (out ?? v) as T;
}
