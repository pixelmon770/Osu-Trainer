// Analiza replaya: każde kliknięcie przypisujemy do nuty tak jak osu!stable
// (okna oceny, notelock, stosy), a potem liczymy metryki z SPEC.md, sekcja 5.

import type { Beatmap } from './beatmap.ts';
import { circleRadius, hitWindows, preemptMs } from './difficulty.ts';
import { Keys, Mods, modAcronyms, type Replay, type ReplayFrame } from './replay.ts';
import { placeObjects, type PlacedObject } from './stacking.ts';
import { findStreams } from './streams.ts';

export type KeyName = 'K1' | 'K2' | 'M1' | 'M2';
export type Judgement = 300 | 100 | 50 | 0;
/**
 * Rodzaje missów:
 * - noClick: w oknie nuty nie było żadnego kliknięcia (np. w streamie zabrakło tapnięcia)
 * - aim: kliknięcie było na czas, ale kursor był poza kółkiem
 * - early: kliknięcie w kółko dużo za wcześnie (przed oknem 50)
 * - notelock: kliknięcie trafiło w następną nutę, zanim ta została zaliczona
 */
export type MissKind = 'noClick' | 'aim' | 'early' | 'notelock';

export interface NoteResult {
  /** numer obiektu w mapie (bez spinnerów) */
  index: number;
  time: number;
  kind: 'circle' | 'slider';
  judgement: Judgement;
  /** ms; ujemne = za wcześnie */
  errorMs: number | null;
  key: KeyName | null;
  /** odległość kursora od środka w promieniach kółka (przy kliknięciu albo w czasie nuty przy missie) */
  distance: number | null;
  /** przestrzelenie (+) / niedociągnięcie (−) w promieniach, wzdłuż kierunku ruchu */
  overshoot: number | null;
  missKind: MissKind | null;
  /** numer streamu, do którego należy nuta, i pozycja w nim (od 1) */
  stream: number | null;
  streamPosition: number | null;
}

export interface ErrorStats {
  count: number;
  /** średni błąd w ms (ujemny = średnio za wcześnie) */
  mean: number;
  /** unstable rate = 10 × odchylenie standardowe */
  ur: number;
}

export interface Segment {
  startMs: number;
  endMs: number;
  notes: number;
  misses: number;
  accuracy: number;
  errors: ErrorStats;
}

export interface ReplayAnalysis {
  player: string;
  playedAt: string;
  mods: string[];
  score: number;
  maxCombo: number;
  /** liczniki zapisane przez osu! (z sliderami i spinnerami) */
  header: { count300: number; count100: number; count50: number; countMiss: number; accuracy: number };
  difficulty: { cs: number; ar: number; od: number; radius: number; windows: { great: number; ok: number; meh: number } };
  notes: NoteResult[];
  /** wyliczone przez nas oceny początków obiektów (kółka + główki sliderów) */
  judged: { count300: number; count100: number; count50: number; countMiss: number; accuracy: number };
  errors: ErrorStats;
  keys: Record<KeyName, ErrorStats & { presses: number }>;
  misses: Record<MissKind, number>;
  streams: {
    notes: number;
    errors: ErrorStats;
    outside: ErrorStats;
    /** pierwsza nuta każdego streamu – wejście w burst */
    entry: ErrorStats;
    byPosition: { range: string; errors: ErrorStats; misses: number; notes: number }[];
    /** % par sąsiednich nut w streamach zagranych na przemian (K1→K2 albo K2→K1) */
    alternation: number;
    alternationBreaks: number;
    /** rozrzut odstępów między tapnięciami względem rytmu mapy (ms, odchylenie standardowe) */
    tapSpread: number;
  };
  aim: {
    /** średnia odległość kliknięcia od środka, w promieniach */
    meanDistance: number;
    /** średnie przestrzelenie na skokach > 1,5 średnicy (+ za daleko, − za krótko), w promieniach */
    jumpOvershoot: number;
    jumpCount: number;
  };
  timeline: Segment[];
  /** długość jednego odcinka osi czasu (krótsza na krótkich mapach) */
  segmentMs: number;
  /** czas, od którego celność spada w dwóch kolejnych odcinkach (reguła zmęczenia), albo null */
  fatigueAt: number | null;
  /** replay kończy się przed końcem mapy (np. wyjście w trakcie) */
  partial: boolean;
  lastFrameMs: number;
}

interface Press {
  time: number;
  x: number;
  y: number;
  key: KeyName;
}

/** Okno, w którym kliknięcie w kółko przed czasem daje miss (jak w osu!). */
const EARLY_MISS_MS = 400;
/** ~10 odcinków na mapę, od 5 do 20 sekund, zaokrąglone do 5 s */
function segmentLength(durationMs: number): number {
  return Math.min(20000, Math.max(5000, Math.round(durationMs / 10 / 5000) * 5000));
}

export function effectiveDifficulty(beatmap: Beatmap, mods: number) {
  let { cs, ar, od } = beatmap.difficulty;
  if (mods & Mods.HardRock) {
    cs = Math.min(10, cs * 1.3);
    ar = Math.min(10, ar * 1.4);
    od = Math.min(10, od * 1.4);
  } else if (mods & Mods.Easy) {
    cs *= 0.5;
    ar *= 0.5;
    od *= 0.5;
  }
  return { cs, ar, od };
}

export function extractPresses(frames: ReplayFrame[]): Press[] {
  const presses: Press[] = [];
  let prev = 0;
  for (const f of frames) {
    const k = f.keys;
    if (k & Keys.M1 && !(prev & Keys.M1)) presses.push({ time: f.time, x: f.x, y: f.y, key: k & Keys.K1 ? 'K1' : 'M1' });
    if (k & Keys.M2 && !(prev & Keys.M2)) presses.push({ time: f.time, x: f.x, y: f.y, key: k & Keys.K2 ? 'K2' : 'M2' });
    prev = k;
  }
  return presses;
}

function cursorAt(frames: ReplayFrame[], time: number): { x: number; y: number } | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.time <= time) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo]!;
  const b = frames[lo + 1];
  if (!b || b.time <= a.time || a.time > time) return { x: a.x, y: a.y };
  const t = (time - a.time) / (b.time - a.time);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function errorStats(values: number[]): ErrorStats {
  if (values.length === 0) return { count: 0, mean: 0, ur: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { count: values.length, mean, ur: 10 * Math.sqrt(variance) };
}

function accuracy(c300: number, c100: number, c50: number, miss: number): number {
  const total = c300 + c100 + c50 + miss;
  return total ? ((300 * c300 + 100 * c100 + 50 * c50) / (300 * total)) * 100 : 0;
}

export function analyzeReplay(beatmap: Beatmap, replay: Replay): ReplayAnalysis {
  const diff = effectiveDifficulty(beatmap, replay.mods);
  const radius = circleRadius(diff.cs);
  const windows = hitWindows(diff.od);
  const preempt = preemptMs(diff.ar);
  const placed = placeObjects(beatmap, { ...diff, flipY: (replay.mods & Mods.HardRock) !== 0 }).filter(
    (o): o is PlacedObject & { kind: 'circle' | 'slider' } => o.kind !== 'spinner'
  );
  const frames = replay.frames;
  const presses = extractPresses(frames);
  const lastFrameMs = frames.length ? frames[frames.length - 1]!.time : 0;

  const notes: NoteResult[] = placed.map((o, i) => ({
    index: i,
    time: o.time,
    kind: o.kind,
    judgement: 0,
    errorMs: null,
    key: null,
    distance: null,
    overshoot: null,
    missKind: null,
    stream: null,
    streamPosition: null
  }));

  // kliknięcia „obok” nuty w jej oknie – do rozróżnienia missów
  const strayInWindow = new Set<number>();
  const lockedBy = new Set<number>();

  let p = 0;
  for (const press of presses) {
    while (p < placed.length && press.time - placed[p]!.time > windows.meh) p++;
    if (p >= placed.length) break;
    const obj = placed[p]!;
    const err = press.time - obj.time;
    if (err < -Math.min(EARLY_MISS_MS, preempt)) continue; // za wcześnie, nuta jeszcze nie przyjmuje kliknięć
    const d = Math.hypot(press.x - obj.x, press.y - obj.y);
    if (d <= radius) {
      const note = notes[p]!;
      note.key = press.key;
      note.distance = d / radius;
      if (Math.abs(err) <= windows.meh) {
        note.errorMs = err;
        note.judgement = Math.abs(err) <= windows.great ? 300 : Math.abs(err) <= windows.ok ? 100 : 50;
        const prev = placed[p - 1];
        if (prev && Math.hypot(obj.x - prev.x, obj.y - prev.y) > 3 * radius) {
          const len = Math.hypot(obj.x - prev.x, obj.y - prev.y);
          note.overshoot = ((press.x - obj.x) * (obj.x - prev.x) + (press.y - obj.y) * (obj.y - prev.y)) / len / radius;
        }
      } else {
        note.missKind = 'early';
      }
      p++;
      continue;
    }
    // kursor poza kółkiem: notelock, jeśli trafił w którąś z kolejnych nut
    if (Math.abs(err) <= windows.meh) strayInWindow.add(p);
    for (let q = p + 1; q < placed.length && placed[q]!.time - press.time <= Math.min(EARLY_MISS_MS, preempt); q++) {
      const o = placed[q]!;
      if (Math.hypot(press.x - o.x, press.y - o.y) <= radius) {
        lockedBy.add(p);
        break;
      }
    }
  }

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    if (n.judgement !== 0 || n.missKind === 'early') continue;
    const c = cursorAt(frames, n.time);
    if (c) n.distance = Math.hypot(c.x - placed[i]!.x, c.y - placed[i]!.y) / radius;
    n.missKind = lockedBy.has(i) ? 'notelock' : strayInWindow.has(i) ? 'aim' : 'noClick';
  }

  // replay przerwany w trakcie: nuty po ostatniej klatce nie są missami, tylko nie zostały zagrane
  const partial = placed.length > 0 && lastFrameMs < placed[placed.length - 1]!.time;
  const played = notes.filter((n) => n.time <= lastFrameMs);

  // przynależność do streamów
  const streams = findStreams(beatmap);
  streams.forEach((s, si) => {
    for (let k = 0; k < s.notes; k++) {
      const n = notes[s.startIndex + k];
      if (n) {
        n.stream = si;
        n.streamPosition = k + 1;
      }
    }
  });

  const hits = played.filter((n) => n.errorMs !== null);
  const errs = (list: NoteResult[]) => errorStats(list.filter((n) => n.errorMs !== null).map((n) => n.errorMs!));

  const keys = {} as ReplayAnalysis['keys'];
  for (const k of ['K1', 'K2', 'M1', 'M2'] as const) {
    keys[k] = { ...errs(hits.filter((n) => n.key === k)), presses: presses.filter((pr) => pr.key === k && pr.time <= lastFrameMs).length };
  }

  const misses: Record<MissKind, number> = { noClick: 0, aim: 0, early: 0, notelock: 0 };
  for (const n of played) if (n.judgement === 0 && n.missKind) misses[n.missKind]++;

  const count = (j: Judgement) => played.filter((n) => n.judgement === j).length;
  const judged = { count300: count(300), count100: count(100), count50: count(50), countMiss: count(0), accuracy: 0 };
  judged.accuracy = accuracy(judged.count300, judged.count100, judged.count50, judged.countMiss);

  // streamy
  const inStream = played.filter((n) => n.stream !== null);
  const bins: [string, number, number][] = [['1', 1, 1], ['2–4', 2, 4], ['5–8', 5, 8], ['9–16', 9, 16], ['17–32', 17, 32], ['33+', 33, Infinity]];
  let pairs = 0;
  let same = 0;
  const intervalErrors: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const a = notes[i - 1]!;
    const b = notes[i]!;
    if (a.stream === null || a.stream !== b.stream || b.time > lastFrameMs) continue;
    if (a.errorMs === null || b.errorMs === null || !a.key || !b.key) continue;
    pairs++;
    if (a.key === b.key) same++;
    intervalErrors.push(b.errorMs - a.errorMs);
  }

  // celowanie
  const withDistance = hits.filter((n) => n.distance !== null);
  const jumps = hits.filter((n) => n.overshoot !== null);

  // oś czasu
  const timeline: Segment[] = [];
  const segmentMs = played.length ? segmentLength(played[played.length - 1]!.time - played[0]!.time) : 20000;
  if (played.length) {
    const start = played[0]!.time;
    const end = played[played.length - 1]!.time;
    for (let t = start; t <= end; t += segmentMs) {
      const seg = played.filter((n) => n.time >= t && n.time < t + segmentMs);
      if (seg.length === 0) continue;
      const c = (j: Judgement) => seg.filter((n) => n.judgement === j).length;
      timeline.push({
        startMs: t,
        endMs: Math.min(t + segmentMs, end),
        notes: seg.length,
        misses: c(0),
        accuracy: accuracy(c(300), c(100), c(50), c(0)),
        errors: errs(seg)
      });
    }
  }
  // reguła zmęczenia: celność spada dwa razy z rzędu (pomijamy odcinki z małą liczbą nut)
  let fatigueAt: number | null = null;
  const minNotes = Math.max(10, segmentMs / 1000);
  const solid = timeline.filter((s) => s.notes >= minNotes);
  for (let i = 2; i < solid.length; i++) {
    if (solid[i]!.accuracy < solid[i - 1]!.accuracy - 1 && solid[i - 1]!.accuracy < solid[i - 2]!.accuracy - 1) {
      fatigueAt = solid[i - 1]!.startMs;
      break;
    }
  }

  return {
    player: replay.player,
    playedAt: replay.playedAt.toISOString(),
    mods: modAcronyms(replay.mods),
    score: replay.score,
    maxCombo: replay.maxCombo,
    header: {
      count300: replay.count300,
      count100: replay.count100,
      count50: replay.count50,
      countMiss: replay.countMiss,
      accuracy: accuracy(replay.count300, replay.count100, replay.count50, replay.countMiss)
    },
    difficulty: { ...diff, radius, windows },
    notes,
    judged,
    errors: errs(hits),
    keys,
    misses,
    streams: {
      notes: inStream.length,
      errors: errs(inStream),
      outside: errs(played.filter((n) => n.stream === null)),
      entry: errs(inStream.filter((n) => n.streamPosition === 1)),
      byPosition: bins.map(([range, lo, hi]) => {
        const list = inStream.filter((n) => n.streamPosition! >= lo && n.streamPosition! <= hi);
        return { range, errors: errs(list), misses: list.filter((n) => n.judgement === 0).length, notes: list.length };
      }),
      alternation: pairs ? ((pairs - same) / pairs) * 100 : 0,
      alternationBreaks: same,
      tapSpread: errorStats(intervalErrors).ur / 10
    },
    aim: {
      meanDistance: withDistance.length ? withDistance.reduce((s, n) => s + n.distance!, 0) / withDistance.length : 0,
      jumpOvershoot: jumps.length ? jumps.reduce((s, n) => s + n.overshoot!, 0) / jumps.length : 0,
      jumpCount: jumps.length
    },
    timeline,
    segmentMs,
    fatigueAt,
    partial,
    lastFrameMs
  };
}
