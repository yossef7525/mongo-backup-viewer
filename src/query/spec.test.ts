import { describe, expect, it } from 'vitest';
import { Decimal128, ObjectId, BSONRegExp } from 'bson';
import { EMPTY_INPUT, parseQuerySpec, shellToJson5 } from './spec';

const parse = (over: Partial<typeof EMPTY_INPUT>) => parseQuerySpec({ ...EMPTY_INPUT, ...over });

describe('shellToJson5', () => {
  it('rewrites shell helpers outside strings only', () => {
    expect(shellToJson5(`{_id: ObjectId("6ac7bc35a1199923c9df947a"), note: "ObjectId('x')"}`)).toBe(
      `{_id: {"$oid":"6ac7bc35a1199923c9df947a"}, note: "ObjectId('x')"}`,
    );
    expect(shellToJson5(`{d: {$gte: ISODate('2026-01-01')}, n: NumberLong(5), x: new Date("2026-02-01")}`)).toBe(
      `{d: {$gte: {"$date":"2026-01-01"}}, n: {"$numberLong":"5"}, x: {"$date":"2026-02-01"}}`,
    );
  });

  it('wraps numeric Date arguments as epoch milliseconds', () => {
    expect(shellToJson5(`{d: Date(5)}`)).toBe(`{d: {"$date":{"$numberLong":"5"}}}`);
  });

  it('does not touch identifiers that merely end with a helper name', () => {
    expect(shellToJson5(`{myObjectId: 1}`)).toBe(`{myObjectId: 1}`);
  });
});

describe('parseQuerySpec', () => {
  it('defaults to an empty filter', () => {
    expect(parse({})).toEqual({ ok: true, spec: { filter: {}, skip: 0 } });
  });

  it('parses shell-like filters into BSON values', () => {
    const r = parse({ filter: `{_id: ObjectId("6ac7bc35a1199923c9df947a"), price: {$gt: NumberDecimal("1.5")}, at: {$lt: {$date: "2026-01-01"}}, name: {$regex: '^a', $options: 'i'}}` });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.spec.filter._id).toEqual(new ObjectId('6ac7bc35a1199923c9df947a'));
    expect(r.spec.filter.price.$gt).toEqual(Decimal128.fromString('1.5'));
    expect(r.spec.filter.at.$lt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(r.spec.filter.name).toBeInstanceOf(BSONRegExp);
  });

  it('rejects invalid dates', () => {
    const r = parse({ filter: '{d: ISODate("garbage")}' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.filter?.code).toBe('invalidJson');
  });

  it('parses numeric epoch-millisecond Date arguments', () => {
    const r = parse({ filter: '{d: new Date(1700000000000)}' });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.spec.filter.d).toEqual(new Date(1700000000000));
  });

  it('parses projection, sort, skip and limit', () => {
    const r = parse({ projection: '{name: 1, _id: 0}', sort: '{createdAt: -1, name: 1}', skip: '20', limit: '5' });
    expect(r).toEqual({ ok: true, spec: { filter: {}, projection: { name: 1, _id: 0 }, sort: { createdAt: -1, name: 1 }, skip: 20, limit: 5 } });
  });

  it('reports per-field errors', () => {
    const r = parse({ filter: '{a: ', projection: '[1]', sort: '{a: 2}', skip: '-1', limit: '1.5' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.filter?.code).toBe('invalidJson');
    expect(r.errors.projection?.code).toBe('notObject');
    expect(r.errors.sort?.code).toBe('invalidSort');
    expect(r.errors.skip?.code).toBe('invalidNumber');
    expect(r.errors.limit?.code).toBe('invalidNumber');
  });
});
