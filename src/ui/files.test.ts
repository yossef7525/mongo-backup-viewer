import { describe, expect, it } from 'vitest';
import { filesFromDataTransfer, onlyGz, sortFiles } from './files';

const f = (n: string) => new File([], n);
const names = (files: File[]) => files.map((x) => x.name);

const fileEntry = (file: File) => ({ isFile: true, isDirectory: false, file: (ok: (f: File) => void) => ok(file) }) as unknown as FileSystemEntry;
const dirEntry = (children: FileSystemEntry[]) =>
  ({
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let done = false;
      return { readEntries: (ok: (e: FileSystemEntry[]) => void) => ok(done ? [] : ((done = true), children)) };
    },
  }) as unknown as FileSystemEntry;
const transfer = (entries: FileSystemEntry[], files: File[] = []) =>
  ({ items: entries.map((e) => ({ webkitGetAsEntry: () => e })), files }) as unknown as DataTransfer;

describe('files', () => {
  it('onlyGz keeps .gz files sorted', () => {
    expect(names(onlyGz([f('b.gz'), f('notes.txt'), f('A.GZ'), f('a.gz')]))).toEqual(['a.gz', 'A.GZ', 'b.gz']);
  });

  it('sortFiles keeps every picked file', () => {
    expect(names(sortFiles([f('b.gz'), f('notes.txt'), f('a.gz')]))).toEqual(['a.gz', 'b.gz', 'notes.txt']);
  });

  it('keeps dropped files as-is but only .gz files from dropped folders', async () => {
    const dt = transfer([fileEntry(f('dump.bson')), dirEntry([fileEntry(f('x.gz')), fileEntry(f('readme.txt')), dirEntry([fileEntry(f('y.GZ'))])]), fileEntry(f('a.gz'))]);
    expect(names(await filesFromDataTransfer(dt))).toEqual(['a.gz', 'dump.bson', 'x.gz', 'y.GZ']);
  });

  it('falls back to dt.files without filtering when entries are unavailable', async () => {
    expect(names(await filesFromDataTransfer(transfer([], [f('b.txt'), f('a.gz')])))).toEqual(['a.gz', 'b.txt']);
  });
});
