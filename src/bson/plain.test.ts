import { describe, expect, it } from 'vitest';
import { Binary, BSONRegExp, Decimal128, Int32, Long, MaxKey, MinKey, ObjectId, Timestamp, UUID, deserialize, serialize } from 'bson';
import { toPlain, toQueryable } from './plain';

const oid = new ObjectId('6ac7bc35a1199923c9df947a');
const uuid = new UUID('a00ad8bd-e9e8-4cf0-a43c-333f619f2f25');

describe('toPlain', () => {
  it('converts BSON types to plain JSON values', () => {
    const doc = deserialize(
      serialize({
        _id: oid,
        at: new Date('2026-01-02T03:04:05.000Z'),
        safe: Long.fromNumber(5),
        big: Long.fromString('9007199254740993'),
        price: Decimal128.fromString('12.50'),
        bin: new Binary(new Uint8Array([104, 105])),
        id: new Binary(uuid.buffer, 4),
        ts: new Timestamp({ t: 5, i: 7 }),
        re: /ab+/i,
        min: new MinKey(),
        max: new MaxKey(),
        nested: { list: [oid, { d: new Date(0) }] },
      }),
    );
    expect(toPlain(doc)).toEqual({
      _id: '6ac7bc35a1199923c9df947a',
      at: '2026-01-02T03:04:05.000Z',
      safe: 5,
      big: '9007199254740993',
      price: '12.50',
      bin: 'aGk=',
      id: 'a00ad8bd-e9e8-4cf0-a43c-333f619f2f25',
      ts: { t: 5, i: 7 },
      re: '/ab+/i',
      min: '$minKey',
      max: '$maxKey',
      nested: { list: ['6ac7bc35a1199923c9df947a', { d: '1970-01-01T00:00:00.000Z' }] },
    });
  });

  it('keeps a field named __proto__ as data', () => {
    const doc = deserialize(serialize(JSON.parse('{"a":1,"__proto__":{"x":2},"b":[{"__proto__":3}]}')));
    const out = toPlain(doc) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(['a', '__proto__', 'b']);
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toEqual(JSON.parse('{"x":2}'));
    expect(JSON.stringify(out)).toBe('{"a":1,"__proto__":{"x":2},"b":[{"__proto__":3}]}');
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('maps invalid dates to null', () => {
    expect(toPlain({ d: new Date(NaN) })).toEqual({ d: null });
  });
});

describe('toQueryable', () => {
  it('turns numeric wrappers into numbers and regex/binary into comparable values', () => {
    const v = toQueryable({
      a: Long.fromNumber(3),
      b: Decimal128.fromString('2.5'),
      c: new Int32(4),
      r: new BSONRegExp('^a', 'ix'),
      u: uuid,
      bin: new Binary(new Uint8Array([104, 105])),
      keep: oid,
      arr: [Long.fromNumber(1), 'x'],
    }) as Record<string, unknown>;
    expect(v.a).toBe(3);
    expect(v.b).toBe(2.5);
    expect(v.c).toBe(4);
    expect(v.r).toEqual(/^a/i);
    expect(v.u).toBe('a00ad8bd-e9e8-4cf0-a43c-333f619f2f25');
    expect(v.bin).toBe('aGk=');
    expect(v.keep).toBe(oid);
    expect(v.arr).toEqual([1, 'x']);
  });

  it('converts inside a field named __proto__ without touching the prototype', () => {
    const doc = deserialize(serialize(JSON.parse('{"__proto__":{"n":1}}')), { promoteValues: false }) as Record<string, unknown>;
    const out = toQueryable(doc);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toEqual(JSON.parse('{"n":1}'));
  });

  it('returns the same reference when nothing needs converting', () => {
    const doc = { a: 1, b: { c: [oid, new Date(0)] } };
    expect(toQueryable(doc)).toBe(doc);
  });
});
