import { deserialize, type Document } from 'bson';

const MIN_SLAB = 64 * 1024;
const MAX_SLAB = 16 * 1024 * 1024;

/** Append-only raw BSON storage for one collection; documents are deserialized on demand. */
export class CollectionStore {
  private slabs: Uint8Array[] = [];
  private used = 0; // bytes used in the last slab
  private slabOf: number[] = [];
  private offsetOf: number[] = [];
  private lengthOf: number[] = [];
  private total = 0;

  get count(): number {
    return this.offsetOf.length;
  }

  get bytes(): number {
    return this.total;
  }

  append(bson: Uint8Array): void {
    let slab = this.slabs[this.slabs.length - 1];
    if (!slab || this.used + bson.length > slab.length) {
      const grown = slab ? Math.min(MAX_SLAB, slab.length * 2) : MIN_SLAB;
      slab = new Uint8Array(Math.max(grown, bson.length));
      this.slabs.push(slab);
      this.used = 0;
    }
    slab.set(bson, this.used);
    this.slabOf.push(this.slabs.length - 1);
    this.offsetOf.push(this.used);
    this.lengthOf.push(bson.length);
    this.used += bson.length;
    this.total += bson.length;
  }

  getRaw(i: number): Uint8Array {
    if (!Number.isInteger(i) || i < 0 || i >= this.count) throw new RangeError(`Document index ${i} out of range`);
    const o = this.offsetOf[i];
    return this.slabs[this.slabOf[i]].subarray(o, o + this.lengthOf[i]);
  }

  get(i: number): Document {
    return deserialize(this.getRaw(i));
  }
}
