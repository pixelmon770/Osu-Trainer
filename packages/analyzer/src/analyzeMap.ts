// Pełna analiza mapy: wszystko, czego potrzebują Statystyki, Biblioteka map i rekomendacje.

import { parseBeatmap, type Beatmap } from './beatmap.ts';
import { jumpStats, type JumpStats } from './jumps.ts';
import { readingStats, type ReadingStats } from './reading.ts';
import { findBlocks, findStreams, playableObjects, weightedByNotes, type StreamBlock, type StreamOptions } from './streams.ts';

export interface MapAnalysis {
  title: string;
  artist: string;
  version: string;
  creator: string;
  beatmapId?: number;
  cs: number;
  ar: number;
  od: number;
  lengthMs: number;
  objects: number;
  streams: {
    count: number;
    notes: number;
    /** % obiektów będących częścią streamów */
    percentOfObjects: number;
    totalMs: number;
    /** BPM streamów (średnia ważona liczbą nut) */
    bpm: number;
    medianLength: number;
    longest: { notes: number; durationMs: number; startMs: number; spacing: number } | null;
    /** średni spacing (ważony liczbą nut) */
    spacing: number;
    /** najdłuższe bloki (streamy z przerwami < 1 s), malejąco */
    longestBlocks: StreamBlock[];
    lengthHistogram: { range: string; count: number }[];
  };
  jumps: JumpStats;
  reading: ReadingStats;
}

export function analyzeMapText(text: string, opts: StreamOptions = {}): MapAnalysis {
  return analyzeBeatmap(parseBeatmap(text), opts);
}

export function analyzeBeatmap(beatmap: Beatmap, opts: StreamOptions = {}): MapAnalysis {
  const objs = playableObjects(beatmap);
  const streams = findStreams(beatmap, opts);
  const blocks = findBlocks(streams, opts.blockGapSeconds ?? 1).sort((a, b) => b.durationMs - a.durationMs);
  const notes = streams.reduce((s, x) => s + x.notes, 0);
  const lengths = streams.map((s) => s.notes).sort((a, b) => a - b);
  const longest = streams.reduce<(typeof streams)[number] | null>((best, s) => (!best || s.notes > best.notes ? s : best), null);
  const bins: [string, number, number][] = [['5–8', 5, 8], ['9–16', 9, 16], ['17–32', 17, 32], ['33–64', 33, 64], ['65+', 65, Infinity]];

  return {
    title: beatmap.metadata.title,
    artist: beatmap.metadata.artist,
    version: beatmap.metadata.version,
    creator: beatmap.metadata.creator,
    beatmapId: beatmap.metadata.beatmapId,
    cs: beatmap.difficulty.cs,
    ar: beatmap.difficulty.ar,
    od: beatmap.difficulty.od,
    lengthMs: objs.length ? objs[objs.length - 1]!.time - objs[0]!.time : 0,
    objects: objs.length,
    streams: {
      count: streams.length,
      notes,
      percentOfObjects: objs.length ? (notes / objs.length) * 100 : 0,
      totalMs: streams.reduce((s, x) => s + x.durationMs, 0),
      bpm: weightedByNotes(streams, (s) => s.bpm),
      medianLength: lengths.length ? lengths[lengths.length >> 1]! : 0,
      longest: longest
        ? { notes: longest.notes, durationMs: longest.durationMs, startMs: longest.startMs, spacing: longest.spacing }
        : null,
      spacing: weightedByNotes(streams, (s) => s.spacing),
      longestBlocks: blocks.slice(0, 5),
      lengthHistogram: bins.map(([range, lo, hi]) => ({ range, count: lengths.filter((n) => n >= lo && n <= hi).length }))
    },
    jumps: jumpStats(beatmap, opts.tolerance),
    reading: readingStats(beatmap)
  };
}

/** mm:ss do wyświetlania */
export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
