import { describe, expect, it } from 'vitest';
import { Decimal128, EJSON, ObjectId } from 'bson';
import { createWriter, exportFileInfo, type ExportFormat } from './writers';

const docs = [
  { _id: new ObjectId('6ac7bc35a1199923c9df947a'), at: new Date('2026-01-01T00:00:00.000Z'), price: Decimal128.fromString('1.50'), name: 'שלום' },
  { _id: new ObjectId('6ac7bc35a1199923c9df947b'), n: 2 },
];
const write = (f: ExportFormat, list = docs) => {
  const w = createWriter(f);
  return w.begin() + list.map((d) => w.doc(d)).join('') + w.end();
};

describe('writers', () => {
  it('json: plain array', () => {
    const parsed = JSON.parse(write('json'));
    expect(parsed).toEqual([
      { _id: '6ac7bc35a1199923c9df947a', at: '2026-01-01T00:00:00.000Z', price: '1.50', name: 'שלום' },
      { _id: '6ac7bc35a1199923c9df947b', n: 2 },
    ]);
  });

  it('ejson: canonical array that round-trips', () => {
    const text = write('ejson');
    expect(text).toContain('"$oid":"6ac7bc35a1199923c9df947a"');
    expect(text).toContain('"$numberDecimal":"1.50"');
    const back = EJSON.parse(text, { relaxed: false }) as typeof docs;
    expect(back[0]._id).toEqual(docs[0]._id);
    expect(back[0].at).toEqual(docs[0].at);
  });

  it('jsonl: one plain document per line', () => {
    const lines = write('jsonl').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toEqual({ _id: '6ac7bc35a1199923c9df947b', n: 2 });
  });

  it('empty results are still valid', () => {
    expect(JSON.parse(write('json', []))).toEqual([]);
    expect(JSON.parse(write('ejson', []))).toEqual([]);
    expect(write('jsonl', [])).toBe('');
  });

  it('file info', () => {
    expect(exportFileInfo('jsonl')).toEqual({ extension: '.jsonl', mime: 'application/x-ndjson' });
    expect(exportFileInfo('ejson').extension).toBe('.json');
  });
});
