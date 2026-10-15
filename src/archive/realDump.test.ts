import { describe, expect, it } from 'vitest';
import { openAsBlob, readdirSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { groupInputs, isDumpInput, type PathEntry } from './dirDump';
import { openDirDump } from './openDump';

// Opt-in: a real `mongodump --db <x> --out <dir>` (with or without --gzip) of the demo data (public/demo.gz):
// MBV_DUMP_DIR=/path/to/dir npx vitest run src/archive/realDump.test.ts
const dir = process.env.MBV_DUMP_DIR;

async function entriesOf(root: string): Promise<PathEntry[]> {
  const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && isDumpInput(d.name));
  return Promise.all(
    files.map(async (d) => {
      const full = join(d.parentPath, d.name);
      return { file: new File([await openAsBlob(full)], d.name), path: relative(dirname(root), full).split('\\').join('/') };
    }),
  );
}

describe.runIf(dir)('real directory dump', () => {
  it('opens every collection with its indexes', async () => {
    const { archives, dumps } = groupInputs(await entriesOf(dir!));
    expect(archives).toEqual([]);
    expect(dumps.map((d) => d.name)).toEqual([basename(dir!)]);
    const a = await openDirDump(dumps[0]);
    expect(a.error).toBeNull();
    const byName = Object.fromEntries(a.collections.map((c) => [c.meta.collection, c]));
    expect(byName.customers.store.count).toBe(240);
    expect(byName.orders.store.count).toBe(1200);
    expect(byName.products.store.count).toBe(8);
    for (const c of a.collections) expect(c.complete).toBe(true);
    expect(byName.customers.meta.indexes.map((i) => i.name)).toEqual(['_id_', 'email_1']);
    expect(byName.customers.meta.indexes[1]).toMatchObject({ key: { email: 1 }, unique: true });
    expect(byName.orders.meta.indexes.map((i) => i.name)).toEqual(['_id_', 'customerId_1_createdAt_-1']);
    expect(byName.orders.store.get(0)).toHaveProperty('_id');
    console.log(a.db, a.collections.map((c) => `${c.meta.collection}:${c.store.count}`).join(' '));
  }, 120_000);
});
