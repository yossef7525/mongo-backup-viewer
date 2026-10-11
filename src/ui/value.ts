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

function dateText(v: unknown): string {
  const ms = typeof v === 'object' && v !== null && '$numberLong' in v ? Number((v as { $numberLong: string }).$numberLong) : Date.parse(String(v));
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** Describes one value of a relaxed-EJSON document for display. */
export function describeValue(v: unknown): ValueView {
  if (v === null || v === undefined) return { kind: 'null', text: 'null' };
  if (typeof v === 'string') return { kind: 'string', text: v };
  if (typeof v === 'number' || typeof v === 'bigint') return { kind: 'number', text: String(v) };
  if (typeof v === 'boolean') return { kind: 'boolean', text: String(v) };
  if (Array.isArray(v)) return { kind: 'array', text: `[${v.length}]` };
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1) {
    const inner = o[keys[0]] as Record<string, unknown>;
    switch (keys[0]) {
      case '$oid':
        return { kind: 'objectId', text: `ObjectId("${String(inner)}")` };
      case '$date':
        return { kind: 'date', text: dateText(inner) };
      case '$numberDecimal':
        return { kind: 'decimal', text: String(inner) };
      case '$numberLong':
        return { kind: 'long', text: String(inner) };
      case '$numberDouble':
      case '$numberInt':
        return { kind: 'number', text: String(inner) };
      case '$binary': {
        const b64 = String(inner.base64);
        if (inner.subType === '04' || inner.subType === '4') {
          const hex = base64ToHex(b64);
          return { kind: 'uuid', text: `UUID("${hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}")` };
        }
        return { kind: 'binary', text: `Binary("${b64.length > 48 ? `${b64.slice(0, 48)}…` : b64}")` };
      }
      case '$regularExpression':
        return { kind: 'regex', text: `/${String(inner.pattern)}/${String(inner.options)}` };
      case '$timestamp':
        return { kind: 'timestamp', text: `Timestamp(${String(inner.t)}, ${String(inner.i)})` };
      case '$minKey':
        return { kind: 'key', text: 'MinKey' };
      case '$maxKey':
        return { kind: 'key', text: 'MaxKey' };
      case '$symbol':
        return { kind: 'string', text: String(inner) };
      case '$code':
        return { kind: 'string', text: String(inner) };
    }
  }
  return { kind: 'object', text: `{${keys.length}}` };
}

export const isBranch = (view: ValueView) => view.kind === 'array' || view.kind === 'object';
