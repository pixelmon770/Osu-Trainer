// Parser plików .osu (osu!standard). Czyta tylko to, czego potrzebuje analiza:
// metadane, trudność, punkty czasowe i obiekty.

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
  timingPoints: TimingPoint[];
  hitObjects: HitObject[];
}

export class BeatmapParseError extends Error {}

export function parseBeatmap(text: string): Beatmap {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = lines[0]?.match(/osu file format v(\d+)/);
  const formatVersion = header ? Number(header[1]) : 0;

  const kv: Record<string, Record<string, string>> = {};
  const timingPoints: TimingPoint[] = [];
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
      if (uninherited && beatLength > 0) {
        timingPoints.push({ time, beatLength, meter: Number(p[2] ?? 4) || 4 });
      }
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
      sliderMultiplier: num(d.SliderMultiplier, 1.4),
      sliderTickRate: num(d.SliderTickRate, 1)
    },
    mode: num(g.Mode, 0),
    timingPoints,
    hitObjects
  };
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

  if (type & 8) return { time, x, y, endX: x, endY: y, kind: 'spinner', newCombo };

  if (type & 2) {
    let endX = x;
    let endY = y;
    const slides = Number(p[6] ?? 1);
    const points = (p[5] ?? '').split('|').slice(1).map((s) => s.split(':').map(Number));
    const last = points[points.length - 1];
    if (last && last.length >= 2 && slides % 2 === 1) {
      endX = last[0]!;
      endY = last[1]!;
    }
    return { time, x, y, endX, endY, kind: 'slider', newCombo };
  }

  return { time, x, y, endX: x, endY: y, kind: 'circle', newCombo };
}
