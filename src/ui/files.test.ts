import { describe, expect, it } from 'vitest';
import type { PathEntry } from '../archive/dirDump';
import { entriesFromPicker, filesFromDataTransfer, sortEntries } from './files';

const f = (n: string, relative = '') => {
  const file = new File([], n);
  if (relative) Object.defineProperty(file, 'webkitRelativePath', { value: relative });
  return file;
};
const paths = (entries: PathEntry[]) => entries.map((x) => x.path);

const fileEntry = (file: File) => ({ isFile: true, isDirectory: false, name: file.name, file: (ok: (f: File) => void) => ok(file) }) as unknown as FileSystemEntry;
const dirEntry = (name: string, children: FileSystemEntry[]) =>
  ({
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let done = false;
      return { readEntries: (ok: (e: FileSystemEntry[]) => void) => ok(done ? [] : ((done = true), children)) };
    },
  }) as unknown as FileSystemEntry;
const transfer = (entries: FileSystemEntry[], files: File[] = []) =>
  ({ items: entries.map((e) => ({ webkitGetAsEntry: () => e })), files }) as unknown as DataTransfer;

describe('files', () => {
  it('sortEntries orders by path, case-insensitively first', () => {
    const e = (p: string) => ({ file: f(p), path: p });
    expect(paths(sortEntries([e('b.gz'), e('dump/x.bson'), e('A.gz'), e('a.gz')]))).toEqual(['a.gz', 'A.gz', 'b.gz', 'dump/x.bson']);
  });

  it('keeps every individually picked file, named by its file name', () => {
    expect(paths(entriesFromPicker([f('b.gz'), f('notes.txt'), f('a.bson')], false))).toEqual(['a.bson', 'b.gz', 'notes.txt']);
  });

  it('keeps archives and dump parts of a picked folder, with their relative paths', () => {
    const picked = [
      f('orders.bson.gz', 'dump/shop/orders.bson.gz'),
      f('orders.metadata.json.gz', 'dump/shop/orders.metadata.json.gz'),
      f('users.bson', 'dump/shop/users.bson'),
      f('users.metadata.json', 'dump/shop/users.metadata.json'),
      f('prelude.json', 'dump/prelude.json'),
      f('old.gz', 'dump/old.gz'),
      f('readme.txt', 'dump/readme.txt'),
    ];
    expect(paths(entriesFromPicker(picked, true))).toEqual([
      'dump/old.gz',
      'dump/shop/orders.bson.gz',
      'dump/shop/orders.metadata.json.gz',
      'dump/shop/users.bson',
      'dump/shop/users.metadata.json',
    ]);
  });

  it('keeps dropped files as-is but only archives and dump parts from dropped folders', async () => {
    const dt = transfer([
      fileEntry(f('dump.bson')),
      dirEntry('dump', [fileEntry(f('x.gz')), fileEntry(f('readme.txt')), dirEntry('shop', [fileEntry(f('y.GZ')), fileEntry(f('o.bson')), fileEntry(f('o.metadata.json')), fileEntry(f('o.json'))])]),
      fileEntry(f('a.gz')),
    ]);
    expect(paths(await filesFromDataTransfer(dt))).toEqual(['a.gz', 'dump.bson', 'dump/shop/o.bson', 'dump/shop/o.metadata.json', 'dump/shop/y.GZ', 'dump/x.gz']);
  });

  it('falls back to dt.files without filtering when entries are unavailable', async () => {
    expect(paths(await filesFromDataTransfer(transfer([], [f('b.txt'), f('a.gz')])))).toEqual(['a.gz', 'b.txt']);
  });
});
