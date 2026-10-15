/** A file with its path relative to what the user picked or dropped, e.g. `dump/shop/orders.bson.gz`. */
export interface PathEntry {
  file: File;
  path: string;
}

export interface DirDumpCollection {
  db: string;
  collection: string;
  bson: File;
  metadata?: File;
}

/** A mongodump directory-format dump (`mongodump --out`): one folder per database with `<coll>.bson[.gz]` files. */
export interface DirDump {
  name: string;
  collections: DirDumpCollection[];
}

/** Database name used for `.bson` files picked on their own, outside any folder. */
export const LOOSE_DB = '_';
/** Dump name used for `.bson` files picked on their own. */
export const LOOSE_DUMP = 'files';

const BSON = /\.bson(\.gz)?$/i;
const METADATA = /\.metadata\.json(\.gz)?$/i;

/** True for the files a folder walk keeps: archives (.gz) and directory-dump parts. */
export const isDumpInput = (name: string) => /\.gz$/i.test(name) || BSON.test(name) || METADATA.test(name);

/** mongodump percent-escapes characters that are unsafe in file names. */
function unescape(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

const cmp = (a: string, b: string) => a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0);

interface Group {
  name: string;
  bson: Map<string, DirDumpCollection>;
  metadata: Map<string, File>;
  /** oplog.bson at the root of a dump (`--oplog`); ignored unless it turns out to be a collection with metadata. */
  rootOplog: Map<string, File>;
}

/**
 * Splits picked/dropped files into mongodump archives and directory dumps. A `.bson` file's database is its parent folder
 * and its dump is the folder holding the database folders (or the database folder itself when it was picked directly).
 */
export function groupInputs(entries: PathEntry[]): { archives: File[]; dumps: DirDump[] } {
  const archives: File[] = [];
  const groups = new Map<string, Group>();
  const group = (root: string, name: string) => {
    let g = groups.get(root);
    if (!g) groups.set(root, (g = { name, bson: new Map(), metadata: new Map(), rootOplog: new Map() }));
    return g;
  };

  for (const { file, path } of entries) {
    const parts = path.split('/').filter(Boolean);
    const base = parts.pop() ?? file.name;
    const isBson = BSON.test(base);
    const isMeta = !isBson && METADATA.test(base);
    if (!isBson && !isMeta) {
      archives.push(file);
      continue;
    }
    // depth 0: loose file; 1: files directly in the picked folder (the database); 2+: <dump>/<db>/<file>.
    const root = parts.length === 0 ? '' : (parts.length === 1 ? parts : parts.slice(0, -1)).join('/');
    const g = group(root, root || LOOSE_DUMP);
    const db = parts.length === 0 ? LOOSE_DB : unescape(parts[parts.length - 1]);
    const raw = base.replace(isBson ? BSON : METADATA, '');
    const key = `${db}\0${raw}`;
    if (isMeta) {
      if (!g.metadata.has(key)) g.metadata.set(key, file);
    } else if (parts.length === 1 && raw === 'oplog') {
      if (!g.rootOplog.has(key)) g.rootOplog.set(key, file);
    } else if (!g.bson.has(key)) {
      g.bson.set(key, { db, collection: unescape(raw), bson: file });
    }
  }

  const dumps: DirDump[] = [];
  for (const g of groups.values()) {
    for (const [key, file] of g.rootOplog) {
      if (g.metadata.has(key) && !g.bson.has(key)) g.bson.set(key, { db: key.slice(0, key.indexOf('\0')), collection: 'oplog', bson: file });
    }
    if (!g.bson.size) continue;
    const collections = [...g.bson].map(([key, c]) => {
      const metadata = g.metadata.get(key);
      return metadata ? { ...c, metadata } : c;
    });
    collections.sort((a, b) => cmp(a.db, b.db) || cmp(a.collection, b.collection));
    dumps.push({ name: g.name, collections });
  }
  dumps.sort((a, b) => cmp(a.name, b.name));
  return { archives, dumps };
}
