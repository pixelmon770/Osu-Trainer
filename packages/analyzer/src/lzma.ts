// Dekoder LZMA („LZMA alone”: 5 bajtów właściwości + 8 bajtów rozmiaru + dane).
// Tak osu! kompresuje ruchy kursora i klawisze w plikach .osr.
// Przeniesione 1:1 z referencyjnego dekodera LzmaSpec.cpp Igora Pavlova (domena publiczna).

export class LzmaError extends Error {}

const TOP = 1 << 24;
const PROB_INIT = 1024;

class RangeDecoder {
  private range = 0xffffffff;
  private code = 0;
  private readonly buf: Uint8Array;
  pos: number;
  constructor(buf: Uint8Array, pos: number) {
    this.buf = buf;
    this.pos = pos;
    if (buf[this.pos++] !== 0) throw new LzmaError('Uszkodzone dane LZMA.');
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.byte()) >>> 0;
    if (this.code === this.range) throw new LzmaError('Uszkodzone dane LZMA.');
  }

  private byte(): number {
    if (this.pos >= this.buf.length) throw new LzmaError('Dane LZMA są ucięte.');
    return this.buf[this.pos++]!;
  }

  private normalize(): void {
    if (this.range < TOP) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.byte()) >>> 0;
    }
  }

  bit(probs: Uint16Array, i: number): number {
    const v = probs[i]!;
    const bound = (this.range >>> 11) * v;
    let bit: number;
    if (this.code < bound) {
      probs[i] = v + ((2048 - v) >>> 5);
      this.range = bound;
      bit = 0;
    } else {
      probs[i] = v - (v >>> 5);
      this.code -= bound;
      this.range -= bound;
      bit = 1;
    }
    this.normalize();
    return bit;
  }

  direct(numBits: number): number {
    let res = 0;
    for (let i = 0; i < numBits; i++) {
      this.range >>>= 1;
      let b = 0;
      if (this.code >= this.range) {
        this.code -= this.range;
        b = 1;
      }
      res = res * 2 + b;
      this.normalize();
    }
    return res;
  }

  tree(probs: Uint16Array, offset: number, numBits: number): number {
    let m = 1;
    for (let i = 0; i < numBits; i++) m = (m << 1) + this.bit(probs, offset + m);
    return m - (1 << numBits);
  }

  reverseTree(probs: Uint16Array, offset: number, numBits: number): number {
    let m = 1;
    let symbol = 0;
    for (let i = 0; i < numBits; i++) {
      const b = this.bit(probs, offset + m);
      m = (m << 1) + b;
      symbol |= b << i;
    }
    return symbol;
  }
}

function probs(n: number): Uint16Array {
  return new Uint16Array(n).fill(PROB_INIT);
}

class LenDecoder {
  private choice = probs(2);
  private low = probs(16 * 8);
  private mid = probs(16 * 8);
  private high = probs(256);

  decode(rc: RangeDecoder, posState: number): number {
    if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, posState * 8, 3);
    if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, posState * 8, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}

class OutBuffer {
  data: Uint8Array;
  length = 0;
  constructor(size: number) {
    this.data = new Uint8Array(Math.max(1024, size));
  }
  put(b: number): void {
    if (this.length === this.data.length) {
      const bigger = new Uint8Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    this.data[this.length++] = b;
  }
  back(dist: number): number {
    return this.data[this.length - dist - 1]!;
  }
}

export function lzmaDecompress(input: Uint8Array): Uint8Array {
  if (input.length < 13) throw new LzmaError('Dane LZMA są za krótkie.');
  let d = input[0]!;
  if (d >= 9 * 5 * 5) throw new LzmaError('Nieprawidłowe właściwości LZMA.');
  const lc = d % 9;
  d = Math.floor(d / 9);
  const lp = d % 5;
  const pb = Math.floor(d / 5);

  // rozmiar po rozpakowaniu: 8 bajtów, same 0xFF = nieznany (dane kończą się znacznikiem)
  let sizeKnown = false;
  let unpackSize = 0;
  for (let i = 0; i < 8; i++) {
    const b = input[5 + i]!;
    if (b !== 0xff) sizeKnown = true;
    unpackSize += b * 2 ** (8 * i);
  }

  const out = new OutBuffer(sizeKnown ? unpackSize : input.length * 4);
  const rc = new RangeDecoder(input, 13);

  const literal = probs(0x300 << (lc + lp));
  const posSlot = probs(4 << 6);
  const posDecoders = probs(1 + 128 - 14);
  const align = probs(16);
  const isMatch = probs(12 << 4);
  const isRep = probs(12);
  const isRepG0 = probs(12);
  const isRepG1 = probs(12);
  const isRepG2 = probs(12);
  const isRep0Long = probs(12 << 4);
  const lenDecoder = new LenDecoder();
  const repLenDecoder = new LenDecoder();

  const pbMask = (1 << pb) - 1;
  const lpMask = (1 << lp) - 1;
  let state = 0;
  let rep0 = 0;
  let rep1 = 0;
  let rep2 = 0;
  let rep3 = 0;

  const decodeDistance = (len: number): number => {
    const lenState = Math.min(len, 3);
    const slot = rc.tree(posSlot, lenState << 6, 6);
    if (slot < 4) return slot;
    const numDirectBits = (slot >>> 1) - 1;
    let dist = (2 | (slot & 1)) * 2 ** numDirectBits;
    if (slot < 14) return dist + rc.reverseTree(posDecoders, dist - slot, numDirectBits);
    dist += rc.direct(numDirectBits - 4) * 16;
    return dist + rc.reverseTree(align, 0, 4);
  };

  while (!sizeKnown || out.length < unpackSize) {
    const posState = out.length & pbMask;

    if (rc.bit(isMatch, (state << 4) + posState) === 0) {
      const prev = out.length > 0 ? out.back(0) : 0;
      const base = 0x300 * (((out.length & lpMask) << lc) + (prev >>> (8 - lc)));
      let symbol = 1;
      if (state >= 7) {
        let matchByte = out.back(rep0);
        do {
          const matchBit = (matchByte >>> 7) & 1;
          matchByte <<= 1;
          const b = rc.bit(literal, base + ((1 + matchBit) << 8) + symbol);
          symbol = (symbol << 1) | b;
          if (matchBit !== b) break;
        } while (symbol < 0x100);
      }
      while (symbol < 0x100) symbol = (symbol << 1) | rc.bit(literal, base + symbol);
      out.put(symbol - 0x100);
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }

    let len: number;
    if (rc.bit(isRep, state) !== 0) {
      if (out.length === 0) throw new LzmaError('Uszkodzone dane LZMA.');
      if (rc.bit(isRepG0, state) === 0) {
        if (rc.bit(isRep0Long, (state << 4) + posState) === 0) {
          state = state < 7 ? 9 : 11;
          out.put(out.back(rep0));
          continue;
        }
      } else {
        let dist: number;
        if (rc.bit(isRepG1, state) === 0) dist = rep1;
        else {
          if (rc.bit(isRepG2, state) === 0) dist = rep2;
          else {
            dist = rep3;
            rep3 = rep2;
          }
          rep2 = rep1;
        }
        rep1 = rep0;
        rep0 = dist;
      }
      len = repLenDecoder.decode(rc, posState);
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2;
      rep2 = rep1;
      rep1 = rep0;
      len = lenDecoder.decode(rc, posState);
      state = state < 7 ? 7 : 10;
      rep0 = decodeDistance(len);
      if (rep0 === 0xffffffff) break; // znacznik końca danych
      if (rep0 >= out.length) throw new LzmaError('Uszkodzone dane LZMA.');
    }

    len += 2;
    if (sizeKnown) len = Math.min(len, unpackSize - out.length);
    for (let i = 0; i < len; i++) out.put(out.back(rep0));
  }

  return out.data.subarray(0, out.length);
}
