// Ćwiczenia (Rytm i metronom, Trener kliknięć): sekwencje nut i ocena tapnięć.
// Czysta logika bez dźwięku i klawiatury – dzięki temu da się ją testować.

import type { Beatmap } from './beatmap.ts';
import { hitWindows } from './difficulty.ts';
import { errorStats, type ErrorStats } from './replayAnalysis.ts';
import { findStreams } from './streams.ts';

export type Finger = 'K1' | 'K2';

export interface DrillNote {
  /** ms od startu ćwiczenia */
  time: number;
  /** palec, którym nuta powinna być zagrana; null = dowolny */
  finger: Finger | null;
  accent?: boolean;
  /** numer serii (burstu / taktu wzoru) i pozycja w niej od 1 */
  group: number;
  position: number;
}

export interface DrillTap {
  time: number;
  finger: Finger;
}

export interface DrillNoteResult extends DrillNote {
  judgement: 300 | 100 | 50 | 0;
  errorMs: number | null;
  tapFinger: Finger | null;
  wrongFinger: boolean;
}

export interface DrillResult {
  notes: DrillNoteResult[];
  /** tapnięcia niepasujące do żadnej nuty */
  extraTaps: number;
  misses: number;
  wrongFinger: number;
  accuracy: number;
  errors: ErrorStats;
  k1: ErrorStats;
  k2: ErrorStats;
  /** średni błąd K2 minus K1 (dodatnie = K2 później) */
  k2k1: number;
  /** pierwsza nuta każdej serii */
  entry: ErrorStats;
  byPosition: { range: string; errors: ErrorStats; misses: number; notes: number }[];
  /** rozrzut odstępów między kolejnymi tapnięciami względem rytmu (ms) */
  tapSpread: number;
  /** błąd w czasie: średnia z kolejnych odcinków (do wykresu „czy się męczę”) */
  timeline: { startMs: number; mean: number; ur: number; misses: number }[];
}

// ---------- wzory (Rytm i metronom) ----------

/** Wzór zapisany jak w SPEC: L = K1, P = K2, „>” = akcent, „.” = pauza, „x” = dowolny palec. */
export function parsePattern(pattern: string): ({ finger: Finger | null; accent: boolean } | null)[] {
  return pattern
    .trim()
    .split(/\s+/)
    .map((tok) => {
      if (tok === '.' || tok === '·') return null;
      const accent = tok.startsWith('>') || tok.startsWith('›');
      const ch = tok.replace(/^[>›]/, '').toUpperCase();
      return { finger: ch === 'L' ? 'K1' : ch === 'P' ? 'K2' : null, accent };
    });
}

/**
 * Wzór powtarzany przez `durationMs` w tempie `bpm`. `stepsPerBeat` = 4 to 1/4 (jak streamy w osu!), 3 = triole.
 * Każde powtórzenie wzoru to osobna seria (group), żeby liczyć wejście i pozycję.
 */
export function patternNotes(pattern: string, bpm: number, durationMs: number, stepsPerBeat = 4): DrillNote[] {
  const steps = parsePattern(pattern);
  const step = 60000 / bpm / stepsPerBeat;
  const notes: DrillNote[] = [];
  let group = 0;
  for (let t = 0, rep = 0; t + steps.length * step <= durationMs + 1; t += steps.length * step, rep++) {
    let position = 0;
    let started = false;
    steps.forEach((s, i) => {
      if (!s) {
        // pauza kończy serię – kolejna nuta zaczyna nową
        if (started) {
          group++;
          position = 0;
          started = false;
        }
        return;
      }
      started = true;
      notes.push({ time: t + i * step, finger: s.finger, accent: s.accent, group, position: ++position });
    });
    if (started) group++;
  }
  return notes;
}

// ---------- Trener kliknięć ----------

/** Bursty po `length` nut na zmianę palcami, z przerwą `gapBeats`; co `stepEvery` burstów tempo rośnie o `bpmStep`. */
export function burstLadder(opts: {
  length: number;
  startBpm: number;
  bpmStep: number;
  stepEvery: number;
  bursts: number;
  gapBeats?: number;
  startFinger?: Finger;
}): { notes: DrillNote[]; bpmByGroup: number[] } {
  const notes: DrillNote[] = [];
  const bpmByGroup: number[] = [];
  let t = 0;
  const first = opts.startFinger ?? 'K1';
  const other: Finger = first === 'K1' ? 'K2' : 'K1';
  for (let g = 0; g < opts.bursts; g++) {
    const bpm = opts.startBpm + Math.floor(g / Math.max(1, opts.stepEvery)) * opts.bpmStep;
    const step = 60000 / bpm / 4;
    bpmByGroup.push(bpm);
    for (let i = 0; i < opts.length; i++) {
      notes.push({ time: t + i * step, finger: i % 2 === 0 ? first : other, accent: i === 0, group: g, position: i + 1 });
    }
    t += (opts.length - 1) * step + (opts.gapBeats ?? 2) * 60000 / bpm;
  }
  return { notes, bpmByGroup };
}

/** Ciągły stream 1/4 na wytrzymałość. */
export function streamNotes(bpm: number, durationMs: number, startFinger: Finger = 'K1'): DrillNote[] {
  const step = 60000 / bpm / 4;
  const other: Finger = startFinger === 'K1' ? 'K2' : 'K1';
  const notes: DrillNote[] = [];
  for (let i = 0; i * step <= durationMs; i++) {
    notes.push({ time: i * step, finger: i % 2 === 0 ? startFinger : other, accent: i % 16 === 0, group: 0, position: i + 1 });
  }
  return notes;
}

/**
 * Streamy wycięte z mapy: rytm dokładnie jak na mapie, przerwy między streamami skrócone do `gapMs`.
 * `rate` 1 = oryginalne tempo, 0.9 = wolniej, 1.1 = szybciej. Palce na zmianę, każdy stream od K1.
 */
export function mapStreamNotes(beatmap: Beatmap, opts: { rate: number; minNotes?: number; gapMs?: number; maxStreams?: number }) {
  const objs = beatmap.hitObjects.filter((o) => o.kind !== 'spinner');
  const streams = findStreams(beatmap, { minNotes: opts.minNotes ?? 5 }).slice(0, opts.maxStreams ?? 500);
  const notes: DrillNote[] = [];
  let t = 0;
  streams.forEach((s, g) => {
    const start = objs[s.startIndex]!.time;
    for (let i = 0; i < s.notes; i++) {
      const o = objs[s.startIndex + i]!;
      notes.push({ time: t + (o.time - start) / opts.rate, finger: i % 2 === 0 ? 'K1' : 'K2', accent: i === 0, group: g, position: i + 1 });
    }
    t += s.durationMs / opts.rate + (opts.gapMs ?? 1500);
  });
  return { notes, streams: streams.length, bpm: streams.length ? Math.round((streams.reduce((a, s) => a + s.bpm * s.notes, 0) / streams.reduce((a, s) => a + s.notes, 0)) * opts.rate) : 0 };
}

// ---------- ocena ----------

/** Tapnięcia przypisujemy jak w osu!: zawsze do najwcześniejszej czekającej nuty (bez przeskakiwania). */
export function judgeDrill(notes: DrillNote[], taps: DrillTap[], od = 8): DrillResult {
  const w = hitWindows(od);
  const results: DrillNoteResult[] = notes.map((n) => ({ ...n, judgement: 0, errorMs: null, tapFinger: null, wrongFinger: false }));
  let p = 0;
  let extraTaps = 0;
  for (const tap of [...taps].sort((a, b) => a.time - b.time)) {
    while (p < results.length && tap.time - results[p]!.time > w.meh) p++;
    const n = results[p];
    if (!n || n.time - tap.time > w.meh) {
      extraTaps++;
      continue;
    }
    const err = tap.time - n.time;
    n.errorMs = err;
    n.tapFinger = tap.finger;
    n.wrongFinger = n.finger !== null && n.finger !== tap.finger;
    n.judgement = Math.abs(err) <= w.great ? 300 : Math.abs(err) <= w.ok ? 100 : 50;
    p++;
  }

  const hit = results.filter((n) => n.errorMs !== null);
  const errs = (list: DrillNoteResult[]) => errorStats(list.filter((n) => n.errorMs !== null).map((n) => n.errorMs!));
  const k1 = errs(hit.filter((n) => n.tapFinger === 'K1'));
  const k2 = errs(hit.filter((n) => n.tapFinger === 'K2'));
  const count = (j: number) => results.filter((n) => n.judgement === j).length;
  const total = results.length || 1;

  const intervals: number[] = [];
  for (let i = 1; i < results.length; i++) {
    const a = results[i - 1]!;
    const b = results[i]!;
    if (a.group === b.group && a.errorMs !== null && b.errorMs !== null) intervals.push(b.errorMs - a.errorMs);
  }

  const bins: [string, number, number][] = [['1', 1, 1], ['2–4', 2, 4], ['5–8', 5, 8], ['9–16', 9, 16], ['17–32', 17, 32], ['33+', 33, Infinity]];

  const end = results.length ? results[results.length - 1]!.time : 0;
  const segment = Math.max(5000, Math.round(end / 8 / 1000) * 1000);
  const timeline: DrillResult['timeline'] = [];
  for (let t = 0; t <= end; t += segment) {
    const seg = results.filter((n) => n.time >= t && n.time < t + segment);
    if (!seg.length) continue;
    const e = errs(seg);
    timeline.push({ startMs: t, mean: e.mean, ur: e.ur, misses: seg.filter((n) => n.judgement === 0).length });
  }

  return {
    notes: results,
    extraTaps,
    misses: count(0),
    wrongFinger: results.filter((n) => n.wrongFinger).length,
    accuracy: ((300 * count(300) + 100 * count(100) + 50 * count(50)) / (300 * total)) * 100,
    errors: errs(hit),
    k1,
    k2,
    k2k1: k1.count && k2.count ? k2.mean - k1.mean : 0,
    entry: errs(hit.filter((n) => n.position === 1)),
    byPosition: bins
      .map(([range, lo, hi]) => {
        const list = results.filter((n) => n.position >= lo && n.position <= hi);
        return { range, errors: errs(list), misses: list.filter((n) => n.judgement === 0).length, notes: list.length };
      })
      .filter((b) => b.notes > 0),
    tapSpread: errorStats(intervals).ur / 10,
    timeline
  };
}
