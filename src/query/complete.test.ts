import { describe, expect, it } from 'vitest';
import type { FieldPath } from '../worker/fields';
import { applySuggestion, completionContext, shouldAutoOpen, suggest, type CompletionContext } from './complete';

/** Splits 'te|xt' into the text and the caret at the '|'. */
const at = (marked: string): [string, number] => {
  const caret = marked.indexOf('|');
  return [marked.slice(0, caret) + marked.slice(caret + 1), caret];
};
const ctx = (marked: string) => completionContext(...at(marked));

describe('completionContext', () => {
  it('finds a key right after the opening brace', () => {
    expect(ctx('{|')).toEqual({ kind: 'key', prefix: '', replaceFrom: 1, replaceTo: 1 });
    expect(ctx('{ |}')).toEqual({ kind: 'key', prefix: '', replaceFrom: 2, replaceTo: 2 });
  });

  it('finds a key prefix at the start and replaces the whole word', () => {
    expect(ctx('{sta|')).toEqual({ kind: 'key', prefix: 'sta', replaceFrom: 1, replaceTo: 4 });
    expect(ctx('{st|atus: 1}')).toEqual({ kind: 'key', prefix: 'st', replaceFrom: 1, replaceTo: 7 });
    expect(ctx('{shipping.ci|')).toMatchObject({ kind: 'key', prefix: 'shipping.ci' });
  });

  it('finds a key after a comma', () => {
    expect(ctx('{a: 1, b|')).toEqual({ kind: 'key', prefix: 'b', replaceFrom: 7, replaceTo: 8 });
    expect(ctx('{name: "x", |')).toMatchObject({ kind: 'key', prefix: '' });
    expect(ctx('{a: [1, 2], b|')).toMatchObject({ kind: 'key', prefix: 'b' });
    expect(ctx('{a: {b: 1}, |')).toMatchObject({ kind: 'key', prefix: '' });
  });

  it('finds a key in a nested object with its parent path', () => {
    expect(ctx('{a: {b: {c|')).toEqual({ kind: 'key', prefix: 'c', replaceFrom: 9, replaceTo: 10, fieldPath: 'a.b' });
    expect(ctx('{items: {$elemMatch: {pr|')).toMatchObject({ kind: 'key', prefix: 'pr', fieldPath: 'items' });
  });

  it('completes a quoted key, replacing the quotes too', () => {
    expect(ctx('{"ship|')).toEqual({ kind: 'key', prefix: 'ship', replaceFrom: 1, replaceTo: 6, quote: '"' });
    expect(ctx(`{'sh|ip': 1}`)).toEqual({ kind: 'key', prefix: 'sh', replaceFrom: 1, replaceTo: 7, quote: "'" });
  });

  it('finds an operator in a field object', () => {
    expect(ctx('{total: {$g|')).toEqual({ kind: 'operator', prefix: '$g', replaceFrom: 9, replaceTo: 11, fieldPath: 'total' });
    expect(ctx('{total: {$gt: 5, $|')).toMatchObject({ kind: 'operator', prefix: '$', fieldPath: 'total' });
    expect(ctx('{total: {|')).toMatchObject({ kind: 'key', prefix: '', fieldPath: 'total' });
  });

  it('finds a top-level operator, also inside $and arrays', () => {
    expect(ctx('{$o|')).toEqual({ kind: 'operator', prefix: '$o', replaceFrom: 1, replaceTo: 3 });
    expect(ctx('{$and: [{a: 1}, {$o|')).toMatchObject({ kind: 'operator', prefix: '$o' });
    expect(ctx('{$and: [{a: 1}, {$o|')).not.toHaveProperty('fieldPath');
    expect(ctx('{$or: [{|')).toEqual({ kind: 'key', prefix: '', replaceFrom: 8, replaceTo: 8 });
  });

  it('finds a value after a colon', () => {
    expect(ctx('{status: |')).toEqual({ kind: 'value', prefix: '', replaceFrom: 9, replaceTo: 9, fieldPath: 'status' });
    expect(ctx('{status: tr|')).toEqual({ kind: 'value', prefix: 'tr', replaceFrom: 9, replaceTo: 11, fieldPath: 'status' });
    expect(ctx('{total: {$gt: |')).toMatchObject({ kind: 'value', fieldPath: 'total' });
    expect(ctx('{items: {$elemMatch: {price: |')).toMatchObject({ kind: 'value', fieldPath: 'items.price' });
    expect(ctx('{"a.b":|}')).toMatchObject({ kind: 'value', fieldPath: 'a.b' });
  });

  it('finds values inside arrays of values', () => {
    expect(ctx('{tags: {$in: ["a", |')).toMatchObject({ kind: 'value', prefix: '', fieldPath: 'tags' });
    expect(ctx('{tags: [Obj|')).toMatchObject({ kind: 'value', prefix: 'Obj', fieldPath: 'tags' });
  });

  it('returns none inside string literals', () => {
    expect(ctx('{name: "a, b: {c|').kind).toBe('none');
    expect(ctx('{name: "ab|c"}').kind).toBe('none');
    expect(ctx('{a: "x\\", b|').kind).toBe('none');
    expect(ctx(`{a: 'it\\'s {|`).kind).toBe('none');
    expect(ctx('{_id: ObjectId("ab|').kind).toBe('none');
  });

  it('ignores braces and commas that were inside strings', () => {
    expect(ctx('{name: "a, {b", |')).toMatchObject({ kind: 'key', prefix: '' });
    expect(ctx('{"x}": 1, y|')).toMatchObject({ kind: 'key', prefix: 'y' });
  });

  it('returns none where nothing can be completed', () => {
    expect(ctx('|').kind).toBe('none');
    expect(ctx('sta|').kind).toBe('none');
    expect(ctx('{a: 1}|').kind).toBe('none');
    expect(ctx('{a |').kind).toBe('none');
    expect(ctx('{a: 1 |').kind).toBe('none');
    expect(ctx('{n: NumberLong(|').kind).toBe('none');
  });

  it('continues after shell helpers', () => {
    expect(ctx('{_id: ObjectId("x"), |')).toMatchObject({ kind: 'key', prefix: '' });
  });
});

const paths: FieldPath[] = [
  { path: 'status', types: ['string'] },
  { path: '_id', types: ['objectId'] },
  { path: 'createdAt', types: ['date'] },
  { path: 'shipping', types: ['object'] },
  { path: 'shipping.city', types: ['string'] },
  { path: 'items', types: ['array'] },
  { path: 'items.price', types: ['decimal'] },
  { path: 'Stock', types: ['number'] },
];
const labels = (marked: string, mode: 'filter' | 'projection' | 'sort' = 'filter') => suggest(ctx(marked), mode, paths).map((s) => s.label);

describe('suggest', () => {
  it('offers field paths then logical operators at the top level', () => {
    expect(labels('{|')).toEqual(['status', '_id', 'createdAt', 'shipping', 'shipping.city', 'items', 'items.price', 'Stock', '$and', '$or', '$nor']);
  });

  it('ranks prefix matches before segment and substring matches', () => {
    expect(labels('{s|')).toEqual(['status', 'shipping', 'shipping.city', 'Stock']);
    expect(labels('{ci|')).toEqual(['shipping.city']);
    expect(labels('{pri|')).toEqual(['items.price']);
    expect(labels('{tem|')).toEqual(['items', 'items.price']);
  });

  it('offers only logical operators for a top-level $ prefix', () => {
    expect(labels('{$|')).toEqual(['$and', '$or', '$nor']);
    expect(labels('{$o|')).toEqual(['$or']);
  });

  it('offers comparison operators first, then sub-paths, inside a field object', () => {
    const inField = labels('{total: {|');
    expect(inField[0]).toBe('$eq');
    expect(inField).not.toContain('$and');
    expect(labels('{total: {$g|')).toEqual(['$gt', '$gte']);
    expect(labels('{items: {$elemMatch: {|').filter((l) => !l.startsWith('$'))).toEqual(['price']);
  });

  it('includes types and descriptions as details', () => {
    const [s] = suggest(ctx('{shipping.c|'), 'filter', paths);
    expect(s).toMatchObject({ label: 'shipping.city', detail: 'string' });
    expect(suggest(ctx('{a: {$gte|'), 'filter', paths)[0].detail).toBe('greater than or equal');
  });

  it('offers helpers at value position, ranked by the sampled type', () => {
    expect(labels('{status: |')).toEqual(['ObjectId("")', 'ISODate("")', 'NumberDecimal("")', 'NumberLong()', 'true', 'false', 'null']);
    expect(labels('{createdAt: |')[0]).toBe('ISODate("")');
    expect(labels('{_id: {$in: [|')[0]).toBe('ObjectId("")');
    expect(labels('{items.price: |')[0]).toBe('NumberDecimal("")');
    expect(labels('{status: t|')).toEqual(['true']);
    expect(labels('{status: n|')).toEqual(['null', 'NumberDecimal("")', 'NumberLong()']);
  });

  it('limits projection and sort to field paths and their values', () => {
    expect(labels('{s|', 'projection')).toEqual(['status', 'shipping', 'shipping.city', 'Stock']);
    expect(labels('{$|', 'projection')).toEqual([]);
    expect(labels('{a: {|', 'sort')).not.toContain('$gt');
    expect(labels('{a: |', 'sort')).toEqual(['1', '-1']);
    expect(labels('{a: |', 'projection')).toEqual(['1', '0']);
  });

  it('offers nothing in none context', () => {
    expect(labels('{a: "|')).toEqual([]);
  });
});

describe('applySuggestion', () => {
  const apply = (marked: string, label: string, mode: 'filter' | 'projection' | 'sort' = 'filter') => {
    const [text, caret] = at(marked);
    const c: CompletionContext = completionContext(text, caret);
    const s = suggest(c, mode, paths).find((x) => x.label === label)!;
    const r = applySuggestion(text, c, s);
    return r.text.slice(0, r.caret) + '|' + r.text.slice(r.caret);
  };

  it('inserts a key with a colon', () => {
    expect(apply('{sta|', 'status')).toBe('{status: |');
    expect(apply('{st|atus}', 'status')).toBe('{status: |}');
  });

  it('quotes keys that are not identifiers', () => {
    expect(apply('{ci|', 'shipping.city')).toBe('{"shipping.city": |');
    expect(apply(`{'shi|`, 'shipping.city')).toBe(`{'shipping.city': |`);
    expect(apply('{"sta|', 'status')).toBe('{"status": |');
  });

  it('does not duplicate an existing colon', () => {
    expect(apply('{st|atus: 1}', 'status')).toBe('{status|: 1}');
    expect(apply('{"st|": 1}', 'status')).toBe('{"status"|: 1}');
  });

  it('inserts operators like keys', () => {
    expect(apply('{total: {$g|', '$gte')).toBe('{total: {$gte: |');
  });

  it('places the caret inside helper quotes or parentheses', () => {
    expect(apply('{_id: |', 'ObjectId("")')).toBe('{_id: ObjectId("|")');
    expect(apply('{n: Num|', 'NumberLong()')).toBe('{n: NumberLong(|)');
    expect(apply('{ok: t|', 'true')).toBe('{ok: true|');
    expect(apply('{a: |', '-1', 'sort')).toBe('{a: -1|');
  });
});

describe('shouldAutoOpen', () => {
  const open = (marked: string) => shouldAutoOpen(at(marked)[0], ctx(marked));
  it('opens on key and operator prefixes and right after { or ,', () => {
    expect(open('{s|')).toBe(true);
    expect(open('{a: {$|')).toBe(true);
    expect(open('{|')).toBe(true);
    expect(open('{a: 1, |')).toBe(true);
    expect(open('{a: 1,|')).toBe(true);
  });
  it('opens in values only with a prefix', () => {
    expect(open('{a: |')).toBe(false);
    expect(open('{a: O|')).toBe(true);
    expect(open('{a: [|')).toBe(false);
  });
  it('stays closed elsewhere', () => {
    expect(open('{a: "x|')).toBe(false);
    expect(open('{a |')).toBe(false);
  });
});
