import { describe, expect, it } from 'vitest';
import { ByteQueue } from './byteQueue';

const u8 = (...b: number[]) => new Uint8Array(b);

describe('ByteQueue', () => {
  it('reads little-endian uint32 across chunk boundaries', () => {
    const q = new ByteQueue();
    q.push(u8(0x6d, 0xe2));
    q.push(u8(0x99));
    q.push(u8(0x81, 0x05));
    expect(q.length).toBe(5);
    expect(q.peekUint32()).toBe(0x8199e26d);
    expect(q.peekInt32()).toBe(0x8199e26d | 0);
    expect(q.peekUint32(1)).toBe(0x058199e2);
  });

  it('takes bytes spanning chunks and tracks consumed', () => {
    const q = new ByteQueue();
    q.push(u8(1, 2, 3));
    q.push(u8(4, 5));
    q.push(u8(6));
    expect([...q.take(2)]).toEqual([1, 2]);
    expect([...q.take(3)]).toEqual([3, 4, 5]);
    expect(q.consumed).toBe(5);
    expect(q.length).toBe(1);
    q.skip(1);
    expect(q.length).toBe(0);
  });

  it('ignores empty chunks and throws on underflow', () => {
    const q = new ByteQueue();
    q.push(new Uint8Array(0));
    q.push(u8(1, 2));
    expect(() => q.peekUint32()).toThrow(RangeError);
    expect(() => q.take(3)).toThrow(RangeError);
    expect(() => q.skip(3)).toThrow(RangeError);
  });

  it('returns 0xffffffff terminator as unsigned', () => {
    const q = new ByteQueue();
    q.push(u8(0xff, 0xff, 0xff, 0xff));
    expect(q.peekUint32()).toBe(0xffffffff);
  });
});
