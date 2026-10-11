export type ValueKind =
  | 'string' | 'number' | 'boolean' | 'null' | 'objectId' | 'date' | 'decimal' | 'long'
  | 'binary' | 'uuid' | 'regex' | 'timestamp' | 'key' | 'array' | 'object';

export interface ValueView {
  kind: ValueKind;
  text: string;
}

function base64ToHex(b64: string): string {
  const bin = atob(b64);
  let hex = '';
  for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
  return hex;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Returns null when v is not a $date payload (ISO string, epoch number or {$numberLong}). */
function dateText(v: unknown): string | null {
  let ms: number;
  if (typeof v === 'string') ms = Date.parse(v);
  else if (typeof v === 'number') ms = v;
  else if (isRecord(v) && typeof v.$numberLong === 'string') ms = Number(v.$numberLong);
  else return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(isRecord(v) ? v.$numberLong : v) : d.toISOString();
}

/** Describes a single-key $-wrapper, or returns null when its payload is not the expected shape. */
function describeWrapper(key: string, inner: unknown): ValueView | null {
  switch (key) {
    case '$oid':
      return { kind: 'objectId', text: `ObjectId("${String(inner)}")` };
    case '$date': {
      const text = dateText(inner);
      return text === null ? null : { kind: 'date', text };
    }
    case '$numberDecimal':
      return { kind: 'decimal', text: String(inner) };
    case '$numberLong':
      return { kind: 'long', text: String(inner) };
    case '$numberDouble':
    case '$numberInt':
      return { kind: 'number', text: String(inner) };
    case '$binary': {
      if (!isRecord(inner) || typeof inner.base64 !== 'string' || typeof inner.subType !== 'string' || !BASE64.test(inner.base64)) return null;
      const b64 = inner.base64;
      if (inner.subType === '04' || inner.subType === '4') {
        const hex = base64ToHex(b64);
        return { kind: 'uuid', text: `UUID("${hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}")` };
      }
      return { kind: 'binary', text: `Binary("${b64.length > 48 ? `${b64.slice(0, 48)}…` : b64}")` };
    }
    case '$regularExpression':
      if (!isRecord(inner) || typeof inner.pattern !== 'string' || typeof inner.options !== 'string') return null;
      return { kind: 'regex', text: `/${inner.pattern}/${inner.options}` };
    case '$timestamp':
      if (!isRecord(inner) || typeof inner.t !== 'number' || typeof inner.i !== 'number') return null;
      return { kind: 'timestamp', text: `Timestamp(${inner.t}, ${inner.i})` };
    case '$minKey':
      return { kind: 'key', text: 'MinKey' };
    case '$maxKey':
      return { kind: 'key', text: 'MaxKey' };
    case '$symbol':
    case '$code':
      return { kind: 'string', text: String(inner) };
  }
  return null;
}

/** Describes one value of a relaxed-EJSON document for display. Never throws: malformed wrappers show as objects. */
export function describeValue(v: unknown): ValueView {
  if (v === null || v === undefined) return { kind: 'null', text: 'null' };
  if (typeof v === 'string') return { kind: 'string', text: v };
  if (typeof v === 'number' || typeof v === 'bigint') return { kind: 'number', text: String(v) };
  if (typeof v === 'boolean') return { kind: 'boolean', text: String(v) };
  if (Array.isArray(v)) return { kind: 'array', text: `[${v.length}]` };
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1) {
    const view = describeWrapper(keys[0], o[keys[0]]);
    if (view) return view;
  }
  return { kind: 'object', text: `{${keys.length}}` };
}

export const isBranch = (view: ValueView) => view.kind === 'array' || view.kind === 'object';
