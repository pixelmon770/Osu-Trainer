import { describe, expect, it } from 'vitest';
import { burstLadder, judgeDrill, mapStreamNotes, parseBeatmap, parsePattern, patternNotes, streamNotes, type DrillTap } from '../src/index.ts';
import { line, makeOsu } from './helpers.ts';

describe('wzory', () => {
  it('czyta L/P, akcenty i pauzy', () => {
    expect(parsePattern('›L P . x')).toEqual([{ finger: 'K1', accent: true }, { finger: 'K2', accent: false }, null, { finger: null, accent: false }]);
  });

  it('single stroke 150 BPM: 1/4 co 100 ms, jedna seria na powtórzenie', () => {
    const n = patternNotes('>L P L P L P L P', 150, 1600);
    expect(n).toHaveLength(16);
    expect(n[1]!.time).toBe(100);
    expect(n.map((x) => x.finger).slice(0, 4)).toEqual(['K1', 'K2', 'K1', 'K2']);
    expect(n[8]).toMatchObject({ group: 1, position: 1, accent: true });
  });

  it('burst 5 z pauzami: pauza zaczyna nową serię', () => {
    const n = patternNotes('>L P L P L . . .', 160, 3000);
    expect(n.filter((x) => x.group === 0)).toHaveLength(5);
    expect(n[5]).toMatchObject({ group: 1, position: 1 });
  });
});

describe('generatory trenera', () => {
  it('drabinka burstów podnosi tempo co N burstów', () => {
    const { notes, bpmByGroup } = burstLadder({ length: 5, startBpm: 160, bpmStep: 10, stepEvery: 2, bursts: 6 });
    expect(bpmByGroup).toEqual([160, 160, 170, 170, 180, 180]);
    expect(notes).toHaveLength(30);
    expect(notes[1]!.time - notes[0]!.time).toBeCloseTo(60000 / 160 / 4, 6);
  });

  it('stream na wytrzymałość', () => {
    const n = streamNotes(180, 10000);
    expect(n[1]!.time).toBeCloseTo(83.33, 1);
    expect(n.length).toBe(Math.floor(10000 / (60000 / 180 / 4)) + 1);
  });

  it('streamy z mapy: tempo × rate i skrócone przerwy', () => {
    const map = parseBeatmap(makeOsu({ bpm: 150, objects: [...line(1000, 6, 100, 0, 0, 20), ...line(9000, 5, 100, 0, 0, 20)] }));
    const r = mapStreamNotes(map, { rate: 0.8, gapMs: 1000 });
    expect(r.streams).toBe(2);
    expect(r.notes[1]!.time).toBeCloseTo(125, 6);
    expect(r.notes[6]!.time).toBeCloseTo(500 / 0.8 + 1000, 6);
    expect(r.bpm).toBe(120);
  });
});

describe('ocena tapnięć', () => {
  const notes = patternNotes('>L P L P L P L P', 150, 800); // 8 nut co 100 ms
  // OD 8: 300 ±32, 100 ±76, 50 ±120
  const taps: DrillTap[] = [
    { time: 0, finger: 'K1' },
    { time: 110, finger: 'K2' },
    { time: 200, finger: 'K2' }, // zły palec
    { time: 345, finger: 'K2' }, // 100
    // nuta 400: brak tapnięcia
    { time: 530, finger: 'K2' }, // nuta 400 już przepadła (+130 ms), więc to nuta 500: +30 ms
    { time: 600, finger: 'K1' },
    { time: 640, finger: 'K2' }, // nuta 700, −60 ms = 100
    { time: 1500, finger: 'K1' } // poza wszystkim
  ];
  const r = judgeDrill(notes, taps, 8);

  it('oceny, missy i nadmiarowe tapnięcia', () => {
    expect(r.notes.map((n) => n.judgement)).toEqual([300, 300, 300, 100, 0, 300, 300, 100]);
    expect(r.misses).toBe(1);
    expect(r.extraTaps).toBe(1);
  });

  it('błędy palców i K2−K1', () => {
    expect(r.wrongFinger).toBe(1); // tylko nuta 200: K2 zamiast K1
    expect(r.notes[2]!.wrongFinger).toBe(true);
    expect(r.k1.count).toBeGreaterThan(0);
    expect(r.k2.count).toBeGreaterThan(0);
  });

  it('wejście w serię i pozycje', () => {
    expect(r.entry.count).toBe(1);
    expect(r.entry.mean).toBe(0);
    expect(r.byPosition[0]!.range).toBe('1');
  });
});
