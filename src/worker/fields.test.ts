import { describe, expect, it } from 'vitest';
import { Binary, Decimal128, Double, Int32, Long, ObjectId } from 'bson';
import { MAX_PATHS, samplePaths, typeLabel } from './fields';

describe('typeLabel', () => {
  it('maps BSON values to short labels', () => {
    expect(typeLabel('x')).toBe('string');
    expect(typeLabel(1.5)).toBe('number');
    expect(typeLabel(new Int32(1))).toBe('number');
    expect(typeLabel(new Double(1))).toBe('number');
    expect(typeLabel(Long.fromNumber(5))).toBe('long');
    expect(typeLabel(Decimal128.fromString('1.1'))).toBe('decimal');
    expect(typeLabel(new ObjectId())).toBe('objectId');
    expect(typeLabel(new Date())).toBe('date');
    expect(typeLabel(true)).toBe('bool');
    expect(typeLabel(null)).toBe('null');
    expect(typeLabel(undefined)).toBe('null');
    expect(typeLabel([1])).toBe('array');
    expect(typeLabel({ a: 1 })).toBe('object');
    expect(typeLabel(new Binary(new Uint8Array([1])))).toBe('binary');
    expect(typeLabel(/x/)).toBe('regex');
  });
});

describe('samplePaths', () => {
  it('collects top-level and nested dotted paths with types', () => {
    const paths = samplePaths([{ _id: new ObjectId(), name: 'a', shipping: { city: 'Haifa', zip: 1 } }]);
    expect(paths).toEqual([
      { path: '_id', types: ['objectId'] },
      { path: 'name', types: ['string'] },
      { path: 'shipping', types: ['object'] },
      { path: 'shipping.city', types: ['string'] },
      { path: 'shipping.zip', types: ['number'] },
    ]);
  });

  it('descends into arrays of objects without indices', () => {
    const paths = samplePaths([{ items: [{ price: 1 }, { price: Decimal128.fromString('2'), sku: 'x' }], tags: ['a', 'b'] }]);
    expect(paths).toEqual([
      { path: 'items', types: ['array'] },
      { path: 'items.price', types: ['number', 'decimal'] },
      { path: 'items.sku', types: ['string'] },
      { path: 'tags', types: ['array'] },
    ]);
  });

  it('sorts by the number of documents containing the path, then by name', () => {
    const paths = samplePaths([{ b: 1, a: 1 }, { b: 2, c: { x: 1 } }, { b: 3, c: { x: 2 } }, { items: [{ q: 1 }, { q: 2 }, { q: 3 }] }]);
    expect(paths.map((p) => p.path)).toEqual(['b', 'c', 'c.x', 'a', 'items', 'items.q']);
  });

  it('orders the types of a path by frequency', () => {
    const paths = samplePaths([{ a: null }, { a: 'x' }, { a: 'y' }]);
    expect(paths).toEqual([{ path: 'a', types: ['string', 'null'] }]);
  });

  it('stops at depth 4', () => {
    const paths = samplePaths([{ a: { b: { c: { d: { e: 1 } } } } }]);
    expect(paths.map((p) => p.path)).toEqual(['a', 'a.b', 'a.b.c', 'a.b.c.d']);
  });

  it('caps the number of paths', () => {
    const doc = Object.fromEntries(Array.from({ length: MAX_PATHS + 50 }, (_, i) => [`f${i}`, i]));
    expect(samplePaths([doc])).toHaveLength(MAX_PATHS);
  });

  it('does not descend into BSON wrappers or dates', () => {
    const paths = samplePaths([{ id: new ObjectId(), at: new Date(), n: Long.fromNumber(1) }]);
    expect(paths.map((p) => p.path)).toEqual(['at', 'id', 'n']);
  });
});
