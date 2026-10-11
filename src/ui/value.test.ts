import { describe, expect, it } from 'vitest';
import { describeValue, isBranch } from './value';

describe('describeValue', () => {
  it.each([
    [null, 'null', 'null'],
    ['שלום', 'string', 'שלום'],
    [3.5, 'number', '3.5'],
    [true, 'boolean', 'true'],
    [{ $oid: '6ac7bc35a1199923c9df947a' }, 'objectId', 'ObjectId("6ac7bc35a1199923c9df947a")'],
    [{ $date: '2026-01-01T00:00:00Z' }, 'date', '2026-01-01T00:00:00.000Z'],
    [{ $date: { $numberLong: '-62135596800000' } }, 'date', '0001-01-01T00:00:00.000Z'],
    [{ $numberDecimal: '1.50' }, 'decimal', '1.50'],
    [{ $numberLong: '9007199254740993' }, 'long', '9007199254740993'],
    [{ $numberDouble: 'NaN' }, 'number', 'NaN'],
    [{ $binary: { base64: 'oArYvenoTPCkPDM/YZ8vJQ==', subType: '04' } }, 'uuid', 'UUID("a00ad8bd-e9e8-4cf0-a43c-333f619f2f25")'],
    [{ $binary: { base64: 'aGk=', subType: '00' } }, 'binary', 'Binary("aGk=")'],
    [{ $regularExpression: { pattern: '^a', options: 'i' } }, 'regex', '/^a/i'],
    [{ $timestamp: { t: 5, i: 7 } }, 'timestamp', 'Timestamp(5, 7)'],
    [{ $minKey: 1 }, 'key', 'MinKey'],
    [[1, 2, 3], 'array', '[3]'],
    [{ a: 1, b: 2 }, 'object', '{2}'],
  ])('%j → %s', (input, kind, text) => {
    expect(describeValue(input)).toEqual({ kind, text });
  });

  it.each([
    [{ $binary: null }],
    [{ $binary: 'aGk=' }],
    [{ $binary: { subType: '00' } }],
    [{ $binary: { base64: '***', subType: '04' } }],
    [{ $binary: { base64: '%%%', subType: '00' } }],
    [{ $regularExpression: null }],
    [{ $regularExpression: '^a' }],
    [{ $regularExpression: { pattern: '^a' } }],
    [{ $timestamp: null }],
    [{ $timestamp: 'x' }],
    [{ $timestamp: { t: 5 } }],
    [{ $date: null }],
    [{ $date: {} }],
    [{ $date: { $numberLong: 5 } }],
  ])('falls back to a plain object for malformed %j', (input) => {
    expect(describeValue(input)).toEqual({ kind: 'object', text: '{1}' });
  });

  it('isBranch', () => {
    expect(isBranch(describeValue([1]))).toBe(true);
    expect(isBranch(describeValue({ $oid: 'x' }))).toBe(false);
  });
});
