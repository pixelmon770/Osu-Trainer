import { describe, expect, it } from 'vitest';
import { circleRadius, generateAim, judgeAim } from '../src/index.ts';

const r = circleRadius(4);

describe('generator skoków', () => {
  it('tam i z powrotem: odległość = n średnic, rytm 1/2', () => {
    const n = generateAim({ pattern: 'backforth', distance: 3, bpm: 150, divisor: 2, notes: 6, cs: 4 });
    expect(n[1]!.time).toBe(200);
    expect(Math.hypot(n[1]!.x - n[0]!.x, n[1]!.y - n[0]!.y)).toBeCloseTo(6 * r, 3);
  });

  it('wielokąt: bok = odległość skoku', () => {
    const n = generateAim({ pattern: 'polygon', sides: 4, distance: 2, bpm: 150, divisor: 2, notes: 4, cs: 4 });
    expect(Math.hypot(n[1]!.x - n[0]!.x, n[1]!.y - n[0]!.y)).toBeCloseTo(4 * r, 3);
  });

  it('losowe: wszystko na planszy, te same skoki przy tym samym ziarnie', () => {
    const a = generateAim({ pattern: 'random', distance: 4, bpm: 180, divisor: 2, notes: 200, cs: 4, angles: 'sharp', seed: 7 });
    const b = generateAim({ pattern: 'random', distance: 4, bpm: 180, divisor: 2, notes: 200, cs: 4, angles: 'sharp', seed: 7 });
    expect(a).toEqual(b);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(r - 1e-9);
      expect(p.x).toBeLessThanOrEqual(512 - r + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(r - 1e-9);
      expect(p.y).toBeLessThanOrEqual(384 - r + 1e-9);
    }
  });
});

describe('ocena aimu', () => {
  const notes = [
    { time: 0, x: 100, y: 200, combo: 1 },
    { time: 400, x: 300, y: 200, combo: 2 },
    { time: 800, x: 100, y: 200, combo: 3 },
    { time: 1200, x: 300, y: 200, combo: 4 }
  ];
  const res = judgeAim(
    notes,
    [
      { time: 0, x: 100, y: 200 }, // środek
      { time: 410, x: 300 + r * 0.5, y: 200 }, // przestrzał o pół promienia
      { time: 800, x: 100 + r * 1.5, y: 200 } // obok kółka = miss aim
      // 1200: brak kliknięcia = miss timing
    ],
    8,
    4
  );
  it('trafienia, przestrzał i rodzaje missów', () => {
    expect(res.notes.map((n) => n.judgement)).toEqual([300, 300, 0, 0]);
    expect(res.notes[1]!.along).toBeCloseTo(0.5, 6);
    expect(res.notes.map((n) => n.miss)).toEqual([null, null, 'aim', 'timing']);
    // nuta 3: kliknięcie za krótko (w stronę, z której przyszedł skok) = niedolot
    expect(res.notes[2]!.along).toBeCloseTo(-1.5, 6);
    expect(res.hitRate).toBe(50);
  });
});
