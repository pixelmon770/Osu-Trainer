// Parser plików .osu (osu!standard). Czyta tylko to, czego potrzebuje analiza:
// metadane, trudność, punkty czasowe i obiekty.

import { sliderPath, type CurveType, type Point } from './sliderPath.ts';

export type HitObjectKind = 'circle' | 'slider' | 'spinner';

export interface HitObject {
  /** czas w ms */
  time: number;
  x: number;
  y: number;
  /** pozycja końca (dla slidera: koniec ścieżki przy nieparzystej liczbie przejść, inaczej start) */
  endX: number;
  endY: number;
  kind: HitObjectKind;
  newCombo: boolean;
  /** czas końca w ms (slider: koniec ostatniego przejścia, spinner: koniec kręcenia, kółko: = time) */
  endTime: number;
  /** liczba przejść slidera (1 = bez powtórzeń) */
  slides: number;
  /** długość ścieżki slidera w osu!pikselach */
  pixelLength: number;
  /** slider: rodzaj krzywej i punkty kontrolne (z punktem startu) */
  curveType?: CurveType;
  curvePoints?: Point[];
}

export interface TimingPoint {
  /** czas startu w ms */
  time: number;
  /** długość uderzenia w ms (tylko punkty „czerwone”) */
  beatLength: number;
  meter: number;
}

export interface Beatmap {
  formatVersion: number;
  metadata: {
    title: string;
    artist: string;
    creator: string;
    version: string;
    beatmapId?: number;
    beatmapSetId?: number;
  };
  difficulty: {
    hp: number;
    cs: number;
    od: number;
    ar: number;
    sliderMultiplier: number;
    sliderTickRate: number;
  };
  mode: number;
  /** jak blisko w czasie nuty muszą być, żeby osu! ułożył je w stos (domyślnie 0.7) */
  stackLeniency: number;
  timingPoints: TimingPoint[];
  /** mnożniki prędkości sliderów (zielone punkty); 1 = bez zmiany */
  sliderVelocities: { time: number; multiplier: number }[];
  hitObjects: HitObject[];
}

export class BeatmapParseError extends Error {}

export function parseBeatmap(text: string): Beatmap {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = lines[0]?.match(/osu file format v(\d+)/);
  const formatVersion = header ? Number(header[1]) : 0;

  const kv: Record<string, Record<string, string>> = {};
  const timingPoints: TimingPoint[] = [];
  const allPoints: { time: number; beatLength: number; uninherited: boolean }[] = [];
  const hitObjects: HitObject[] = [];
  let section = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      continue;
    }
    if (section === 'General' || section === 'Metadata' || section === 'Difficulty') {
      const i = line.indexOf(':');
      if (i > 0) (kv[section] ??= {})[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    } else if (section === 'TimingPoints') {
      const p = line.split(',');
      const time = Number(p[0]);
      const beatLength = Number(p[1]);
      const uninherited = p.length > 6 ? p[6] === '1' : beatLength > 0;
      if (!Number.isFinite(time) || !Number.isFinite(beatLength)) continue;
      if (uninherited && beatLength > 0) {
        timingPoints.push({ time, beatLength, meter: Number(p[2] ?? 4) || 4 });
      }
      allPoints.push({ time, beatLength, uninherited });
    } else if (section === 'HitObjects') {
      const obj = parseHitObject(line);
      if (obj) hitObjects.push(obj);
    }
  }

  const g = kv.General ?? {};
  const m = kv.Metadata ?? {};
  const d = kv.Difficulty ?? {};
  const od = num(d.OverallDifficulty, 5);
  timingPoints.sort((a, b) => a.time - b.time);
  hitObjects.sort((a, b) => a.time - b.time);

  if (timingPoints.length === 0) throw new BeatmapParseError('Mapa nie ma punktów czasowych (TimingPoints).');
  if (hitObjects.length === 0) throw new BeatmapParseError('Mapa nie ma obiektów (HitObjects).');

  // Zielony punkt obowiązuje do następnego punktu; czerwony przywraca prędkość 1.
  // Przy tym samym czasie czerwony idzie pierwszy, więc zielony go nadpisuje.
  allPoints.sort((a, b) => a.time - b.time || Number(b.uninherited) - Number(a.uninherited));
  const sliderVelocities = allPoints.map((pt) => ({
    time: pt.time,
    multiplier: pt.uninherited || pt.beatLength >= 0 ? 1 : Math.min(10, Math.max(0.1, 100 / -pt.beatLength))
  }));
  const sliderMultiplier = num(d.SliderMultiplier, 1.4);
  for (const o of hitObjects) {
    if (o.kind !== 'slider') continue;
    const sv = lastAtOrBefore(sliderVelocities, o.time)?.multiplier ?? 1;
    const beat = lastAtOrBefore(timingPoints, o.time)?.beatLength ?? timingPoints[0]!.beatLength;
    o.endTime = o.time + (o.pixelLength / (sliderMultiplier * 100 * sv)) * beat * o.slides;
  }

  return {
    formatVersion,
    metadata: {
      title: m.Title ?? '',
      artist: m.Artist ?? '',
      creator: m.Creator ?? '',
      version: m.Version ?? '',
      beatmapId: m.BeatmapID ? Number(m.BeatmapID) : undefined,
      beatmapSetId: m.BeatmapSetID ? Number(m.BeatmapSetID) : undefined
    },
    difficulty: {
      hp: num(d.HPDrainRate, 5),
      cs: num(d.CircleSize, 5),
      od,
      // stare mapy nie mają AR – wtedy AR = OD
      ar: num(d.ApproachRate, od),
      sliderMultiplier,
      sliderTickRate: num(d.SliderTickRate, 1)
    },
    mode: num(g.Mode, 0),
    stackLeniency: num(g.StackLeniency, 0.7),
    timingPoints,
    sliderVelocities,
    hitObjects
  };
}

function lastAtOrBefore<T extends { time: number }>(list: T[], time: number): T | undefined {
  let lo = 0;
  let hi = list.length - 1;
  let found: T | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.time <= time + 1) {
      found = list[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function num(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseHitObject(line: string): HitObject | null {
  const p = line.split(',');
  if (p.length < 4) return null;
  const x = Number(p[0]);
  const y = Number(p[1]);
  const time = Number(p[2]);
  const type = Number(p[3]);
  if (![x, y, time, type].every(Number.isFinite)) return null;
  const newCombo = (type & 4) !== 0;

  const base = { time, x, y, endX: x, endY: y, newCombo, endTime: time, slides: 1, pixelLength: 0 };

  if (type & 8) {
    const end = Number(p[5]);
    return { ...base, kind: 'spinner', endTime: Number.isFinite(end) ? end : time };
  }

  if (type & 2) {
    let endX = x;
    let endY = y;
    const slides = Math.max(1, Number(p[6] ?? 1) || 1);
    const pixelLength = Math.max(0, Number(p[7] ?? 0) || 0);
    const parts = (p[5] ?? '').split('|');
    const curveType = (['B', 'P', 'L', 'C'].includes(parts[0] ?? '') ? parts[0] : 'B') as CurveType;
    const points: Point[] = [{ x, y }];
    for (const s of parts.slice(1)) {
      const [px, py] = s.split(':').map(Number);
      if (Number.isFinite(px) && Number.isFinite(py)) points.push({ x: px!, y: py! });
    }
    // koniec slidera = koniec ścieżki (przy nieparzystej liczbie przejść)
    if (points.length >= 2 && slides % 2 === 1) {
      const path = sliderPath(curveType, points, pixelLength);
      const end = path[path.length - 1]!;
      endX = end.x;
      endY = end.y;
    }
    // endTime liczymy po wczytaniu punktów czasowych (potrzebna prędkość slidera)
    return { ...base, endX, endY, kind: 'slider', slides, pixelLength, curveType, curvePoints: points };
  }

  return { ...base, kind: 'circle' };
}
