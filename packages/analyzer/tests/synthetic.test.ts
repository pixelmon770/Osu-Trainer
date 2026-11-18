import { describe, expect, it } from 'vitest';
import { analyzeMapText, circleRadius, hitWindows, parseBeatmap, preemptMs } from '../src/index.ts';
import { line, makeOsu } from './helpers.ts';

describe('wzory podstawowe', () => {
  it('promień kółka, AR i okna oceny', () => {
    expect(circleRadius(4)).toBeCloseTo(36.48, 2);
    expect(preemptMs(9)).toBe(600);
    expect(preemptMs(10)).toBe(450);
    expect(preemptMs(5)).toBe(1200);
    expect(hitWindows(8)).toEqual({ great: 32, ok: 76, meh: 120 });
  });
});

describe('parser .osu', () => {
  it('czyta trudność, punkty czasowe i obiekty', () => {
    const map = parseBeatmap(makeOsu({ bpm: 150, objects: line(0, 3, 100, 0, 0, 10) }));
    expect(map.difficulty.cs).toBe(4);
    expect(map.difficulty.ar).toBe(9);
    expect(map.timingPoints[0]!.beatLength).toBe(400);
    expect(map.hitObjects).toHaveLength(3);
  });

  it('bez ApproachRate przyjmuje AR = OD', () => {
    const text = makeOsu({ bpm: 120, od: 7, objects: line(0, 2, 250, 0, 0, 10) }).replace(/ApproachRate:.*\n/, '');
    expect(parseBeatmap(text).difficulty.ar).toBe(7);
  });
});

// 150 BPM: uderzenie 400 ms, 1/4 = 100 ms, 1/2 = 200 ms. CS 4: średnica 72,96 px.
const objects = [
  { t: 0, x: 100, y: 100 },
  { t: 200, x: 300, y: 100 }, // skok 1/2 na 200 px (2,74 średnicy)
  ...line(400, 9, 100, 300, 100, 20), // stream 9 nut, co 20 px
  { t: 1600, x: 460, y: 300 },
  ...line(1800, 5, 100, 100, 300, 20), // burst 5 nut po skoku na 360 px (4,93 średnicy)
  ...line(4000, 6, 100, 256, 192, 40) // osobny stream 6 nut po 1,8 s przerwy
];

describe('streamy i bloki', () => {
  const a = analyzeMapText(makeOsu({ bpm: 150, objects }));

  it('znajduje streamy i ich długości', () => {
    expect(a.streams.count).toBe(3);
    expect(a.streams.notes).toBe(20);
    expect(a.streams.bpm).toBeCloseTo(150, 5);
    expect(a.streams.longest?.notes).toBe(9);
    expect(a.streams.longest?.spacing).toBeCloseTo(20 / 72.96, 3);
  });

  it('łączy streamy rozdzielone przerwą < 1 s w jeden blok', () => {
    expect(a.streams.longestBlocks[0]).toMatchObject({ startMs: 400, endMs: 2200, durationMs: 1800, notes: 14, streams: 2 });
    expect(a.streams.longestBlocks[1]).toMatchObject({ durationMs: 500, notes: 6 });
  });
});

describe('skoki', () => {
  const a = analyzeMapText(makeOsu({ bpm: 150, objects }));
  it('liczy przejścia na 1/2 i ich długość', () => {
    expect(a.jumps.halfBeatMoves).toBe(3);
    expect(a.jumps.jumpsOver1_5Diameters).toBe(2);
    expect(a.jumps.jumpsOver3Diameters).toBe(1);
    expect(a.jumps.averageHalfBeatDistance).toBeCloseTo((200 + 0 + 360) / 3 / 72.96, 3);
  });
});

describe('czytanie', () => {
  it('wykrywa nutę, na którą nachodzi niesąsiednia nuta w oknie AR', () => {
    const a = analyzeMapText(
      makeOsu({ bpm: 150, ar: 9, objects: [{ t: 0, x: 100, y: 100 }, { t: 200, x: 300, y: 300 }, { t: 400, x: 110, y: 100 }] })
    );
    expect(a.reading.overlapPercent).toBeCloseTo(100 / 3, 3);
    expect(a.reading.beatsVisibleAhead).toBeCloseTo(1.5, 5);
  });
});
