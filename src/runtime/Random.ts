import { integer } from './json';

/** xorshift32-v1. Zero seed maps to 0x6d2b79f5. State is an unsigned 32-bit integer. */
export class Random {
  static readonly algorithm = 'xorshift32-v1';
  private value: number;

  constructor(seed: number) {
    integer(seed, 'seed', 0);
    if (seed > 0xffffffff) throw new Error('seed must fit uint32');
    this.value = seed === 0 ? 0x6d2b79f5 : seed;
  }

  nextUint32(): number {
    let x = this.value;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.value = x >>> 0;
    return this.value;
  }

  int(min: number, maxExclusive: number): number {
    integer(min, 'min');
    integer(maxExclusive, 'maxExclusive');
    const width = maxExclusive - min;
    if (!Number.isSafeInteger(width) || width < 1 || width > 0x100000000) {
      throw new Error('random range must have width 1..2^32');
    }
    const limit = Math.floor(0x100000000 / width) * width;
    let value: number;
    do { value = this.nextUint32(); } while (value >= limit);
    return min + value % width;
  }

  snapshot(): number { return this.value; }

  restore(value: number): void {
    integer(value, 'random state', 1);
    if (value > 0xffffffff) throw new Error('invalid random state');
    this.value = value;
  }
}
