import { describe, expect, it } from 'vitest';
import { groupInputs, type DirDump } from './dirDump';

const e = (path: string) => ({ file: new File([], path.split('/').pop()!), path });
const shape = (dumps: DirDump[]) =>
  dumps.map((d) => ({ name: d.name, collections: d.collections.map((c) => [c.db, c.collection, c.bson.name, c.metadata?.name ?? null]) }));

describe('groupInputs', () => {
  it('groups a full dump folder by database and pairs metadata', () => {
    const { archives, dumps } = groupInputs([
      e('dump/shop/orders.bson'),
      e('dump/shop/orders.metadata.json'),
      e('dump/shop/users.bson'),
      e('dump/admin/system.version.bson'),
      e('dump/admin/system.version.metadata.json'),
      e('dump/oplog.bson'),
    ]);
    expect(archives).toEqual([]);
    expect(shape(dumps)).toEqual([
      {
        name: 'dump',
        collections: [
          ['admin', 'system.version', 'system.version.bson', 'system.version.metadata.json'],
          ['shop', 'orders', 'orders.bson', 'orders.metadata.json'],
          ['shop', 'users', 'users.bson', null],
        ],
      },
    ]);
  });

  it('handles gzip dumps, dotted names and percent-escaped names', () => {
    const { dumps } = groupInputs([
      e('out/x/a.b.c.bson.gz'),
      e('out/x/a.b.c.metadata.json.gz'),
      e('out/x/sl%2Fash.bson.gz'),
      e('out/x/bad%E0%A4%A.bson.gz'),
    ]);
    expect(shape(dumps)).toEqual([
      {
        name: 'out',
        collections: [
          ['x', 'a.b.c', 'a.b.c.bson.gz', 'a.b.c.metadata.json.gz'],
          ['x', 'bad%E0%A4%A', 'bad%E0%A4%A.bson.gz', null],
          ['x', 'sl/ash', 'sl%2Fash.bson.gz', null],
        ],
      },
    ]);
  });

  it('uses the picked folder as the database when files sit directly in it', () => {
    const { dumps } = groupInputs([e('shop/orders.bson'), e('shop/orders.metadata.json')]);
    expect(shape(dumps)).toEqual([{ name: 'shop', collections: [['shop', 'orders', 'orders.bson', 'orders.metadata.json']] }]);
  });

  it('keeps a collection named oplog when it has metadata', () => {
    const { dumps } = groupInputs([e('shop/oplog.bson'), e('shop/oplog.metadata.json')]);
    expect(shape(dumps)[0].collections).toEqual([['shop', 'oplog', 'oplog.bson', 'oplog.metadata.json']]);
  });

  it('separates archives from dump parts and groups lone .bson files', () => {
    const { archives, dumps } = groupInputs([
      e('b.gz'),
      e('users.bson'),
      e('users.metadata.json'),
      e('orders.bson.gz'),
      e('dump/a.gz'),
      e('dump/shop/orders.bson'),
      e('notes.txt'),
    ]);
    expect(archives.map((f) => f.name)).toEqual(['b.gz', 'a.gz', 'notes.txt']);
    expect(shape(dumps)).toEqual([
      { name: 'dump', collections: [['shop', 'orders', 'orders.bson', null]] },
      {
        name: 'files',
        collections: [
          ['_', 'orders', 'orders.bson.gz', null],
          ['_', 'users', 'users.bson', 'users.metadata.json'],
        ],
      },
    ]);
  });

  it('ignores metadata without data and keeps separate dumps apart', () => {
    const { archives, dumps } = groupInputs([
      e('dump2/shop/view.metadata.json'),
      e('dump2/shop/a.bson'),
      e('dump1/shop/a.bson'),
      e('lonely.metadata.json.gz'),
    ]);
    expect(archives).toEqual([]);
    expect(shape(dumps).map((d) => [d.name, d.collections.length])).toEqual([
      ['dump1', 1],
      ['dump2', 1],
    ]);
  });

  it('keeps nested dumps of one dropped folder apart', () => {
    const { dumps } = groupInputs([e('backups/d1/shop/a.bson'), e('backups/d2/shop/a.bson')]);
    expect(dumps.map((d) => d.name)).toEqual(['backups/d1', 'backups/d2']);
  });
});
