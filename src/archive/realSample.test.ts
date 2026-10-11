import { describe, expect, it } from 'vitest';
import { openAsBlob } from 'node:fs';
import { openArchive } from './open';

// Opt-in: MBV_SAMPLE=/path/to/real-backup.gz npx vitest run src/archive/realSample.test.ts
const sample = process.env.MBV_SAMPLE;

describe.runIf(sample)('real archive sample', () => {
  it('parses without errors and every collection is complete', async () => {
    const a = await openArchive(await openAsBlob(sample!));
    expect(a.error).toBeNull();
    expect(a.collections.length).toBeGreaterThan(0);
    for (const c of a.collections) {
      expect(c.complete).toBe(true);
      if (c.store.count > 0) expect(c.store.get(0)).toHaveProperty('_id');
    }
    console.log(a.db, a.collections.map((c) => `${c.meta.collection}:${c.store.count}`).join(' '));
  }, 300_000);
});
