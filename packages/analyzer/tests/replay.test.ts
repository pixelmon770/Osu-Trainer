import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeReplay,
  extractPresses,
  Keys,
  modAcronyms,
  parseBeatmap,
  parseFrames,
  parseReplay,
  type Replay,
  type ReplayFrame
} from '../src/index.ts';
import { makeOsu } from './helpers.ts';

function fakeReplay(frames: ReplayFrame[], mods = 0): Replay {
  return {
    mode: 0,
    gameVersion: 20260101,
    beatmapMd5: '',
    player: 'test',
    replayMd5: '',
    count300: 0,
    count100: 0,
    count50: 0,
    countGeki: 0,
    countKatu: 0,
    countMiss: 0,
    score: 0,
    maxCombo: 0,
    perfect: false,
    mods,
    playedAt: new Date(0),
    onlineScoreId: 0,
    frames
  };
}

/** Kursor stoi w (x, y); w chwili `time` wciska i po 30 ms puszcza klawisz. */
function tap(time: number, x: number, y: number, key: number): ReplayFrame[] {
  return [
    { time: time - 1, x, y, keys: 0 },
    { time, x, y, keys: key },
    { time: time + 30, x, y, keys: 0 }
  ];
}

describe('klatki replaya', () => {
  it('sumuje czasy, pomija znaczniki startu i ziarno', () => {
    const f = parseFrames('0|256|-500|0,-1|256|-500|0,10|100|100|0,5|101|100|5,-12345|0|0|1234,');
    expect(f).toEqual([
      { time: 9, x: 100, y: 100, keys: 0 },
      { time: 14, x: 101, y: 100, keys: 5 }
    ]);
  });

  it('rozpoznaje wciśnięcia K1/K2/M1', () => {
    const presses = extractPresses([
      { time: 0, x: 0, y: 0, keys: 0 },
      { time: 10, x: 0, y: 0, keys: Keys.K1 | Keys.M1 },
      { time: 20, x: 0, y: 0, keys: Keys.K1 | Keys.M1 | Keys.K2 | Keys.M2 },
      { time: 30, x: 0, y: 0, keys: 0 },
      { time: 40, x: 0, y: 0, keys: Keys.M1 }
    ]);
    expect(presses.map((p) => [p.time, p.key])).toEqual([
      [10, 'K1'],
      [20, 'K2'],
      [40, 'M1']
    ]);
  });

  it('nazwy modów', () => {
    expect(modAcronyms(16 | 8)).toEqual(['HD', 'HR']);
    expect(modAcronyms(64 | 512)).toEqual(['NC']);
  });
});

describe('ocena kliknięć', () => {
  // OD 8: 300 = ±32 ms, 100 = ±76 ms, 50 = ±120 ms. CS 4: promień 36,48.
  const map = parseBeatmap(
    makeOsu({
      bpm: 120,
      objects: [
        { t: 1000, x: 100, y: 100 },
        { t: 2000, x: 300, y: 100 },
        { t: 3000, x: 100, y: 300 },
        { t: 4000, x: 300, y: 300 },
        { t: 5000, x: 400, y: 200 },
        { t: 5100, x: 450, y: 200 }
      ]
    })
  );
  const frames = [
    ...tap(1000, 102, 101, Keys.K1 | Keys.M1), // 300, idealnie
    ...tap(2050, 300, 110, Keys.K2 | Keys.M2), // 100, +50 ms
    ...tap(3000, 200, 300, Keys.K1 | Keys.M1), // na czas, ale kursor obok = miss (aim)
    // 4000: brak kliknięcia = miss (noClick)
    ...tap(5060, 450, 200, Keys.K2 | Keys.M2) // klik w nutę 6, gdy nuta 5 czeka = notelock
  ];
  const a = analyzeReplay(map, fakeReplay(frames));

  it('przypisuje oceny i błędy', () => {
    expect(a.notes.map((n) => n.judgement)).toEqual([300, 100, 0, 0, 0, 0]);
    expect(a.notes[0]!.errorMs).toBe(0);
    expect(a.notes[1]!.errorMs).toBe(50);
    expect(a.notes[0]!.key).toBe('K1');
    expect(a.notes[1]!.key).toBe('K2');
  });

  it('rozróżnia rodzaje missów', () => {
    expect(a.notes.map((n) => n.missKind)).toEqual([null, null, 'aim', 'noClick', 'notelock', 'noClick']);
  });

  it('UR i średni błąd', () => {
    expect(a.errors.mean).toBe(25);
    expect(a.errors.ur).toBeCloseTo(250, 5);
  });

  it('HardRock odwraca mapę w pionie', () => {
    const hr = analyzeReplay(map, fakeReplay(tap(1000, 100, 384 - 100, Keys.K1 | Keys.M1), 16));
    expect(hr.notes[0]!.judgement).toBe(300);
    expect(hr.difficulty.od).toBeCloseTo(10, 5);
  });
});

// Prawdziwe replaye: fixtures-local/replays/*.osr + pasujące mapy w fixtures-local/
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const local = join(root, 'fixtures-local');
const replayDir = join(local, 'replays');
const replayFiles = existsSync(replayDir) ? readdirSync(replayDir).filter((f) => f.endsWith('.osr')) : [];

describe.skipIf(replayFiles.length === 0)('prawdziwe replaye', () => {
  for (const f of replayFiles) {
    it(f, async () => {
      const replay = parseReplay(new Uint8Array(readFileSync(join(replayDir, f))));
      const { createHash } = await import('node:crypto');
      const mapFile = readdirSync(local)
        .filter((m) => m.endsWith('.osu'))
        .find((m) => createHash('md5').update(readFileSync(join(local, m))).digest('hex') === replay.beatmapMd5);
      if (!mapFile) return; // brak mapy do tego replaya
      const a = analyzeReplay(parseBeatmap(readFileSync(join(local, mapFile), 'utf8')), replay);
      const headerTotal = replay.count300 + replay.count100 + replay.count50 + replay.countMiss;
      const ours = a.judged.count300 + a.judged.count100 + a.judged.count50 + a.judged.countMiss;
      // osu! ocenia slidery po tickach, a my po główce – dopuszczamy małe różnice
      expect(Math.abs(ours - headerTotal)).toBeLessThanOrEqual(20);
      expect(Math.abs(a.judged.count300 - replay.count300)).toBeLessThanOrEqual(0.02 * headerTotal);
      expect(a.judged.countMiss).toBeLessThanOrEqual(replay.countMiss);
    });
  }
});
