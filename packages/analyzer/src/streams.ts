// Streamy, bursty i bloki streamów (SPEC.md, sekcja 5.2).

import type { Beatmap, HitObject } from './beatmap.ts';
import { beatLengthAt, circleRadius } from './difficulty.ts';

export interface StreamOptions {
  /** minimalna liczba nut w serii, żeby uznać ją za stream (domyślnie 5) */
  minNotes?: number;
  /** tolerancja odstępu względem 1/4 uderzenia (domyślnie 1.15) */
  tolerance?: number;
  /** przerwa (s), poniżej której sąsiednie streamy łączą się w blok (domyślnie 1) */
  blockGapSeconds?: number;
}

export interface Stream {
  /** indeks pierwszego obiektu w beatmap.hitObjects (bez spinnerów) */
  startIndex: number;
  notes: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** BPM liczone z mediany odstępów (1/4) */
  bpm: number;
  /** średnia odległość między nutami / średnica kółka */
  spacing: number;
  maxSpacing: number;
}

export interface StreamBlock {
  startMs: number;
  endMs: number;
  durationMs: number;
  notes: number;
  streams: number;
}

export function playableObjects(beatmap: Beatmap): HitObject[] {
  return beatmap.hitObjects.filter((o) => o.kind !== 'spinner');
}

export function findStreams(beatmap: Beatmap, opts: StreamOptions = {}): Stream[] {
  const minNotes = opts.minNotes ?? 5;
  const tolerance = opts.tolerance ?? 1.15;
  const objs = playableObjects(beatmap);
  const diameter = 2 * circleRadius(beatmap.difficulty.cs);
  const result: Stream[] = [];
  if (objs.length === 0) return result;

  let runStart = 0;
  const close = (endExclusive: number) => {
    const n = endExclusive - runStart;
    if (n >= minNotes) result.push(describe(objs, runStart, endExclusive, diameter));
  };

  for (let i = 1; i < objs.length; i++) {
    const a = objs[i - 1]!;
    const b = objs[i]!;
    const quarter = beatLengthAt(beatmap, a.time) / 4;
    if (b.time - a.time > quarter * tolerance) {
      close(i);
      runStart = i;
    }
  }
  close(objs.length);
  return result;
}

function describe(objs: HitObject[], from: number, to: number, diameter: number): Stream {
  const gaps: number[] = [];
  const dists: number[] = [];
  for (let i = from + 1; i < to; i++) {
    const a = objs[i - 1]!;
    const b = objs[i]!;
    gaps.push(b.time - a.time);
    dists.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const medianGap = median(gaps);
  const meanDist = dists.reduce((s, d) => s + d, 0) / dists.length;
  const startMs = objs[from]!.time;
  const endMs = objs[to - 1]!.time;
  return {
    startIndex: from,
    notes: to - from,
    startMs,
    endMs,
    durationMs: endMs - startMs,
    bpm: 60000 / (4 * medianGap),
    spacing: meanDist / diameter,
    maxSpacing: Math.max(...dists) / diameter
  };
}

export function findBlocks(streams: Stream[], blockGapSeconds = 1): StreamBlock[] {
  const blocks: StreamBlock[] = [];
  let cur: Stream[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const first = cur[0]!;
    const last = cur[cur.length - 1]!;
    blocks.push({
      startMs: first.startMs,
      endMs: last.endMs,
      durationMs: last.endMs - first.startMs,
      notes: cur.reduce((s, x) => s + x.notes, 0),
      streams: cur.length
    });
    cur = [];
  };
  for (const s of streams) {
    const prev = cur[cur.length - 1];
    if (prev && s.startMs - prev.endMs >= blockGapSeconds * 1000) flush();
    cur.push(s);
  }
  flush();
  return blocks;
}

/** Mediana (przy parzystej liczbie: średnia dwóch środkowych wartości). */
export function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** Średnia ważona liczbą nut. */
export function weightedByNotes(streams: Stream[], pick: (s: Stream) => number): number {
  const total = streams.reduce((s, x) => s + x.notes, 0);
  if (total === 0) return 0;
  return streams.reduce((s, x) => s + pick(x) * x.notes, 0) / total;
}
