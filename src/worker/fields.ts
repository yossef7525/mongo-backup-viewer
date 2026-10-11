/** A dotted field path seen in a collection sample, with its value types (most frequent first). */
export interface FieldPath {
  path: string;
  types: string[];
}

export const SAMPLE_SIZE = 200;
export const MAX_DEPTH = 4;
export const MAX_PATHS = 500;

const BSON_LABELS: Record<string, string> = {
  ObjectId: 'objectId',
  Decimal128: 'decimal',
  Long: 'long',
  Int32: 'number',
  Double: 'number',
  Binary: 'binary',
  Timestamp: 'timestamp',
  BSONRegExp: 'regex',
  MinKey: 'minKey',
  MaxKey: 'maxKey',
  Code: 'code',
  BSONSymbol: 'symbol',
  DBRef: 'dbref',
};

const isPlainObject = (v: object) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** A short type label for a deserialized BSON value. */
export function typeLabel(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  switch (typeof v) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'bigint':
      return 'long';
    case 'boolean':
      return 'bool';
    case 'object':
      break;
    default:
      return typeof v;
  }
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (v instanceof RegExp) return 'regex';
  const bson = (v as { _bsontype?: string })._bsontype;
  if (bson) return BSON_LABELS[bson] ?? bson.toLowerCase();
  return 'object';
}

const isSubdoc = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v as { _bsontype?: string })._bsontype && isPlainObject(v);

interface Stat {
  docs: number;
  types: Map<string, number>;
}

/**
 * Collects the dotted field paths of sample documents (arrays of objects contribute their
 * elements' fields without indices), sorted by how many documents contain them, then by name.
 */
export function samplePaths(docs: Iterable<Record<string, unknown>>): FieldPath[] {
  const stats = new Map<string, Stat>();

  for (const doc of docs) {
    const seen = new Set<string>();
    const visit = (obj: Record<string, unknown>, prefix: string, depth: number) => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        let stat = stats.get(path);
        if (!stat) {
          if (stats.size >= MAX_PATHS) continue;
          stat = { docs: 0, types: new Map() };
          stats.set(path, stat);
        }
        if (!seen.has(path)) {
          seen.add(path);
          stat.docs++;
        }
        const label = typeLabel(value);
        stat.types.set(label, (stat.types.get(label) ?? 0) + 1);
        if (depth >= MAX_DEPTH) continue;
        if (isSubdoc(value)) visit(value, path, depth + 1);
        else if (Array.isArray(value)) for (const el of value) if (isSubdoc(el)) visit(el, path, depth + 1);
      }
    };
    visit(doc, '', 1);
  }

  return [...stats]
    .sort(([a, sa], [b, sb]) => sb.docs - sa.docs || (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, s]) => ({ path, types: [...s.types].sort((x, y) => y[1] - x[1]).map(([t]) => t) }));
}
