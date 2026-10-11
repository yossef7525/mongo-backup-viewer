/** FIFO byte buffer over stream chunks; reads may span chunk boundaries. */
export class ByteQueue {
  private chunks: Uint8Array[] = [];
  private head = 0; // read offset inside chunks[0]
  private size = 0;
  consumed = 0;

  get length(): number {
    return this.size;
  }

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.size += chunk.length;
  }

  peekUint32(at = 0): number {
    const b = this.copyOut(at, 4);
    return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  }

  peekInt32(at = 0): number {
    return this.peekUint32(at) | 0;
  }

  take(n: number): Uint8Array {
    const first = this.chunks[0];
    const out =
      first && this.head + n <= first.length
        ? first.subarray(this.head, this.head + n)
        : this.copyOut(0, n);
    this.skip(n);
    return out;
  }

  skip(n: number): void {
    if (n > this.size) throw new RangeError(`ByteQueue underflow: skip ${n} of ${this.size}`);
    this.size -= n;
    this.consumed += n;
    let rest = n;
    while (rest > 0) {
      const available = this.chunks[0].length - this.head;
      if (rest < available) {
        this.head += rest;
        rest = 0;
      } else {
        rest -= available;
        this.chunks.shift();
        this.head = 0;
      }
    }
  }

  private copyOut(at: number, n: number): Uint8Array {
    if (at + n > this.size) throw new RangeError(`ByteQueue underflow: need ${at + n} of ${this.size}`);
    const out = new Uint8Array(n);
    let pos = this.head + at;
    let written = 0;
    for (const chunk of this.chunks) {
      if (pos >= chunk.length) {
        pos -= chunk.length;
        continue;
      }
      const k = Math.min(chunk.length - pos, n - written);
      out.set(chunk.subarray(pos, pos + k), written);
      written += k;
      pos = 0;
      if (written === n) break;
    }
    return out;
  }
}
