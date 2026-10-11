import { describe, expect, it } from 'vitest';
import { serialize } from 'bson';
import { CollectionStore } from './store';

describe('CollectionStore', () => {
  it('appends copies and deserializes lazily', () => {
    const s = new CollectionStore();
    const raw = serialize({ a: 1 });
    s.append(raw);
    raw.fill(0); // the store must have copied
    s.append(serialize({ b: 'x' }));
    expect(s.count).toBe(2);
    expect(s.get(0)).toEqual({ a: 1 });
    expect(s.get(1)).toEqual({ b: 'x' });
    expect(s.bytes).toBe(serialize({ a: 1 }).length + serialize({ b: 'x' }).length);
  });

  it('spans many slabs and holds documents larger than a slab', () => {
    const s = new CollectionStore();
    for (let i = 0; i < 5000; i++) s.append(serialize({ i, pad: 'x'.repeat(100) }));
    // 16 MiB string => ~16 MiB + 15 byte document, which exceeds MAX_SLAB. (bson 7 serialize silently truncates above ~17.8 MB.)
    const big = 'y'.repeat(16 * 1024 * 1024);
    s.append(serialize({ big }));
    expect(s.count).toBe(5001);
    expect(s.get(4321).i).toBe(4321);
    expect((s.get(5000).big as string).length).toBe(big.length);
  });

  it('throws on out-of-range index', () => {
    expect(() => new CollectionStore().get(0)).toThrow(RangeError);
  });
});
