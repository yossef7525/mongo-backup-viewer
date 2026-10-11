import { describe, expect, it } from 'vitest';
import { serialize, deserialize } from 'bson';
import { Query } from 'mingo';

describe('toolchain', () => {
  it('runs bson and mingo', () => {
    const doc = deserialize(serialize({ a: 1 }));
    expect(new Query({ a: { $gt: 0 } }).test(doc)).toBe(true);
  });
});
