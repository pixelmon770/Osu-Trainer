import { describe, expect, it } from 'vitest';
import { parseOsuDb } from '../src/index.ts';

/** Minimalny zapis osu!.db do testów – pole po polu jak w opisie formatu. */
class Writer {
  bytes: number[] = [];
  byte(v: number) {
    this.bytes.push(v & 0xff);
  }
  bool(v: boolean) {
    this.byte(v ? 1 : 0);
  }
  short(v: number) {
    const b = new DataView(new ArrayBuffer(2));
    b.setUint16(0, v, true);
    this.raw(b);
  }
  int(v: number) {
    const b = new DataView(new ArrayBuffer(4));
    b.setInt32(0, v, true);
    this.raw(b);
  }
  single(v: number) {
    const b = new DataView(new ArrayBuffer(4));
    b.setFloat32(0, v, true);
    this.raw(b);
  }
  double(v: number) {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, v, true);
    this.raw(b);
  }
  long() {
    for (let i = 0; i < 8; i++) this.byte(0);
  }
  string(s: string) {
    if (!s) return this.byte(0);
    const enc = new TextEncoder().encode(s);
    this.byte(0x0b);
    let n = enc.length;
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n) b |= 0x80;
      this.byte(b);
    } while (n);
    enc.forEach((x) => this.byte(x));
  }
  private raw(v: DataView) {
    for (let i = 0; i < v.byteLength; i++) this.byte(v.getUint8(i));
  }
}

interface Entry {
  md5: string;
  folder: string;
  file: string;
  title: string;
  stars: number;
}

function buildDb(version: number, entries: Entry[]): Uint8Array {
  const w = new Writer();
  w.int(version);
  w.int(entries.length);
  w.bool(true);
  w.long();
  w.string('parthmage');
  w.int(entries.length);
  for (const e of entries) {
    const body = new Writer();
    body.string('Artist');
    body.string('Artist');
    body.string(e.title);
    body.string(e.title);
    body.string('Mapper');
    body.string('Extra');
    body.string('audio.mp3');
    body.string(e.md5);
    body.string(e.file);
    body.byte(4);
    body.short(100);
    body.short(20);
    body.short(1);
    body.long();
    const diff = (v: number) => (version < 20140609 ? body.byte(v) : body.single(v));
    diff(9);
    diff(4);
    diff(5);
    diff(8);
    body.double(1.4);
    if (version >= 20140609) {
      for (let mode = 0; mode < 4; mode++) {
        const pairs = mode === 0 ? [[0, e.stars], [64, e.stars + 1.5]] : [];
        body.int(pairs.length);
        for (const [mods, stars] of pairs) {
          body.byte(0x08);
          body.int(mods!);
          if (version >= 20250107) {
            body.byte(0x0c);
            body.single(stars!);
          } else {
            body.byte(0x0d);
            body.double(stars!);
          }
        }
      }
    }
    body.int(180);
    body.int(185000);
    body.int(5000);
    body.int(2); // 2 punkty czasowe
    for (let i = 0; i < 2; i++) {
      body.double(400);
      body.double(i * 1000);
      body.bool(true);
    }
    body.int(123);
    body.int(45);
    body.int(0);
    for (let i = 0; i < 4; i++) body.byte(9);
    body.short(0);
    body.single(0.7);
    body.byte(0);
    body.string('');
    body.string('tags');
    body.short(0);
    body.string('');
    body.bool(false);
    body.long();
    body.bool(false);
    body.string(e.folder);
    body.long();
    for (let i = 0; i < 5; i++) body.bool(false);
    if (version < 20140609) body.short(0);
    body.int(0);
    body.byte(0);
    if (version < 20191106) w.int(body.bytes.length);
    w.bytes.push(...body.bytes);
  }
  w.int(4);
  return new Uint8Array(w.bytes);
}

const entries: Entry[] = [
  { md5: 'd166c76a189725b2b34e87533adb8d94', folder: '123 Rhapsody - Power of the Dragonflame', file: "Roupus' Extra.osu", title: 'Power of the Dragonflame', stars: 6.03 },
  { md5: 'aaaabbbbccccddddeeeeffff00001111', folder: '456 GYZE - HONESTY', file: 'DISHONEST.osu', title: 'HONESTY ąę', stars: 7.02 }
];

describe('osu!.db', () => {
  for (const version of [20260924, 20240101, 20150203, 20130101]) {
    it(`wersja ${version}`, () => {
      const db = parseOsuDb(buildDb(version, entries));
      expect(db.player).toBe('parthmage');
      expect(db.beatmaps).toHaveLength(2);
      expect(db.beatmaps[1]).toMatchObject({
        md5: entries[1]!.md5,
        folderName: entries[1]!.folder,
        osuFileName: 'DISHONEST.osu',
        title: 'HONESTY ąę',
        beatmapId: 123,
        beatmapSetId: 45,
        circles: 100,
        totalTimeMs: 185000,
        ar: 9,
        od: 8
      });
      if (version >= 20140609) expect(db.beatmaps[0]!.stars).toBeCloseTo(6.03, 2);
    });
  }

  it('zgłasza ucięty plik', () => {
    const data = buildDb(20260924, entries);
    expect(() => parseOsuDb(data.subarray(0, data.length - 200))).toThrow(/ucięty/);
  });
});
