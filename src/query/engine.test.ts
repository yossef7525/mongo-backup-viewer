import { describe, expect, it } from 'vitest';
import { Decimal128, Long, ObjectId, serialize } from 'bson';
import { CollectionStore } from '../archive/store';
import { executeQuery, materialize } from './engine';
import { parseQuerySpec, EMPTY_INPUT } from './spec';

const ids = Array.from({ length: 10 }, (_, i) => new ObjectId(`6ac7bc35a1199923c9df94${(0x70 + i).toString(16)}`));
const store = new CollectionStore();
ids.forEach((_id, i) =>
  store.append(
    serialize({
      _id,
      i,
      name: i % 2 ? `Alice ${i}` : `bob ${i}`,
      price: Decimal128.fromString(`${i}.5`),
      big: Long.fromNumber(i * 1000),
      tags: i % 3 === 0 ? ['vip', 'x'] : ['x'],
      addr: { city: i < 5 ? 'Jerusalem' : 'Haifa' },
      at: new Date(Date.UTC(2026, 0, 1 + i)),
    }),
  ),
);

async function run(over: Partial<typeof EMPTY_INPUT>) {
  const p = parseQuerySpec({ ...EMPTY_INPUT, ...over });
  if (!p.ok) throw new Error(JSON.stringify(p.errors));
  const r = await executeQuery(store, p.spec);
  return { ...r, docs: [...r.indices].map((i) => materialize(store, i, p.spec.projection)) };
}

describe('executeQuery', () => {
  it('returns everything for an empty filter', async () => {
    const r = await run({});
    expect(r.matched).toBe(10);
    expect([...r.indices]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('matches ObjectId, nested fields, arrays and regex', async () => {
    expect((await run({ filter: `{_id: ObjectId("${ids[3].toHexString()}")}` })).docs.map((d) => d.i)).toEqual([3]);
    expect((await run({ filter: `{'addr.city': 'Haifa', tags: 'vip'}` })).docs.map((d) => d.i)).toEqual([6, 9]);
    expect((await run({ filter: `{name: {$regex: '^alice', $options: 'i'}}` })).matched).toBe(5);
    expect((await run({ filter: `{name: {$regex: '^bob'}}` })).matched).toBe(5);
  });

  it('compares Decimal128, Long and Date numerically', async () => {
    expect((await run({ filter: `{price: {$gt: 7}}` })).docs.map((d) => d.i)).toEqual([7, 8, 9]);
    expect((await run({ filter: `{price: {$lte: NumberDecimal("1.5")}}` })).docs.map((d) => d.i)).toEqual([0, 1]);
    expect((await run({ filter: `{big: {$gte: 8000}}` })).matched).toBe(2);
    expect((await run({ filter: `{at: {$gte: ISODate("2026-01-09")}}` })).docs.map((d) => d.i)).toEqual([8, 9]);
  });

  it('sorts, skips and limits; matched counts before skip/limit', async () => {
    const r = await run({ filter: `{'addr.city': 'Jerusalem'}`, sort: '{i: -1}', skip: '1', limit: '2' });
    expect(r.matched).toBe(5);
    expect(r.docs.map((d) => d.i)).toEqual([3, 2]);
  });

  it('applies projection on materialize and keeps original BSON types', async () => {
    const r = await run({ filter: '{i: 4}', projection: '{price: 1, _id: 0}' });
    expect(r.docs[0]).toEqual({ price: Decimal128.fromString('4.5') });
    expect(r.docs[0].price).toBeInstanceOf(Decimal128);
  });

  it('can be aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const p = parseQuerySpec({ ...EMPTY_INPUT, filter: '{i: 1}' });
    if (!p.ok) throw new Error();
    await expect(executeQuery(store, p.spec, { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
