// Parser plików .osr (replay osu!).
// Opis formatu: https://osu.ppy.sh/wiki/en/Client/File_formats/osr_%28file_format%29

import { lzmaDecompress } from './lzma.ts';

export class ReplayParseError extends Error {}

/** Bity klawiszy w klatce replaya. K1 ustawia też M1, a K2 ustawia też M2. */
export const Keys = { M1: 1, M2: 2, K1: 4, K2: 8, Smoke: 16 } as const;

export const Mods = {
  NoFail: 1,
  Easy: 2,
  TouchDevice: 4,
  Hidden: 8,
  HardRock: 16,
  SuddenDeath: 32,
  DoubleTime: 64,
  Relax: 128,
  HalfTime: 256,
  Nightcore: 512,
  Flashlight: 1024,
  Autoplay: 2048,
  SpunOut: 4096,
  Autopilot: 8192,
  Perfect: 16384
} as const;

const MOD_ACRONYMS: [number, string][] = [
  [Mods.NoFail, 'NF'],
  [Mods.Easy, 'EZ'],
  [Mods.TouchDevice, 'TD'],
  [Mods.Hidden, 'HD'],
  [Mods.HardRock, 'HR'],
  [Mods.SuddenDeath, 'SD'],
  [Mods.DoubleTime, 'DT'],
  [Mods.Relax, 'RX'],
  [Mods.HalfTime, 'HT'],
  [Mods.Nightcore, 'NC'],
  [Mods.Flashlight, 'FL'],
  [Mods.SpunOut, 'SO'],
  [Mods.Autopilot, 'AP'],
  [Mods.Perfect, 'PF']
];

export function modAcronyms(mods: number): string[] {
  const list = MOD_ACRONYMS.filter(([bit]) => mods & bit).map(([, a]) => a);
  // NC zawiera DT, PF zawiera SD – pokazujemy tylko „mocniejszy” mod
  return list.filter((a) => !(a === 'DT' && list.includes('NC')) && !(a === 'SD' && list.includes('PF')));
}

export interface ReplayFrame {
  /** czas w ms od początku piosenki */
  time: number;
  x: number;
  y: number;
  keys: number;
}

export interface Replay {
  mode: number;
  gameVersion: number;
  beatmapMd5: string;
  player: string;
  replayMd5: string;
  count300: number;
  count100: number;
  count50: number;
  countGeki: number;
  countKatu: number;
  countMiss: number;
  score: number;
  maxCombo: number;
  perfect: boolean;
  mods: number;
  /** data gry */
  playedAt: Date;
  onlineScoreId: number;
  frames: ReplayFrame[];
}

class Reader {
  pos = 0;
  private readonly buf: Uint8Array;
  private readonly view: DataView;
  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  private need(n: number) {
    if (this.pos + n > this.buf.length) throw new ReplayParseError('Plik replaya jest ucięty.');
  }
  byte(): number {
    this.need(1);
    return this.buf[this.pos++]!;
  }
  short(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  int(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  long(): bigint {
    this.need(8);
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return v;
  }
  uleb(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.byte();
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return result;
      shift += 7;
    }
  }
  string(): string {
    const marker = this.byte();
    if (marker === 0) return '';
    if (marker !== 0x0b) throw new ReplayParseError('Nieprawidłowy tekst w pliku replaya.');
    const len = this.uleb();
    this.need(len);
    const s = new TextDecoder().decode(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
}

// .NET DateTime.Ticks: 100 ns od 0001-01-01
const TICKS_AT_UNIX_EPOCH = 621355968000000000n;

export function parseReplay(data: Uint8Array): Replay {
  const r = new Reader(data);
  const mode = r.byte();
  const gameVersion = r.int();
  const beatmapMd5 = r.string();
  const player = r.string();
  const replayMd5 = r.string();
  const count300 = r.short();
  const count100 = r.short();
  const count50 = r.short();
  const countGeki = r.short();
  const countKatu = r.short();
  const countMiss = r.short();
  const score = r.int();
  const maxCombo = r.short();
  const perfect = r.byte() === 1;
  const mods = r.int();
  r.string(); // wykres życia – nie potrzebujemy
  const ticks = r.long();
  const length = r.int();
  const compressed = r.bytes(Math.max(0, length));
  let onlineScoreId = 0;
  try {
    onlineScoreId = Number(r.long());
  } catch {
    // stare replaye mogą nie mieć ID wyniku
  }

  if (mode !== 0) throw new ReplayParseError('To replay z innego trybu niż osu!standard.');

  const frames = length > 0 ? parseFrames(new TextDecoder().decode(lzmaDecompress(compressed))) : [];

  return {
    mode,
    gameVersion,
    beatmapMd5,
    player,
    replayMd5,
    count300,
    count100,
    count50,
    countGeki,
    countKatu,
    countMiss,
    score,
    maxCombo,
    perfect,
    mods,
    playedAt: new Date(Number((ticks - TICKS_AT_UNIX_EPOCH) / 10000n)),
    onlineScoreId,
    frames
  };
}

export function parseFrames(text: string): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  let time = 0;
  const parts = text.split(',');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!.split('|');
    if (p.length < 4) continue;
    const delta = Number(p[0]);
    if (delta === -12345) continue; // ostatnia klatka: ziarno losowania, nie ruch
    time += delta;
    const x = Number(p[1]);
    const y = Number(p[2]);
    // dwie pierwsze klatki to znaczniki startu (kursor poza ekranem)
    if (i < 2 && x === 256 && y === -500) continue;
    frames.push({ time, x, y, keys: Number(p[3]) | 0 });
  }
  return frames;
}
