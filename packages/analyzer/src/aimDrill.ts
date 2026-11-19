// Trener aimu: generowanie skoków i ocena (timing + celowanie), bez dźwięku i interfejsu.

import { circleRadius, hitWindows } from './difficulty.ts';
import { errorStats, type ErrorStats } from './replayAnalysis.ts';

export type AimPattern = 'backforth' | 'polygon' | 'random';
export type AngleMode = 'sharp' | 'wide' | 'mixed';

export interface AimNote {
  time: number;
  x: number;
  y: number;
  /** numer w combo (rysowany na kółku) */
  combo: number;
}

export interface AimTap {
  time: number;
  x: number;
  y: number;
}

export interface AimOptions {
  pattern: AimPattern;
  /** odległość skoku w średnicach kółka */
  distance: number;
  bpm: number;
  /** podział uderzenia: 2 = 1/2 (typowe skoki), 1 = 1/1 */
  divisor: number;
  notes: number;
  cs: number;
  /** wielokąt: liczba wierzchołków */
  sides?: number;
  angles?: AngleMode;
  /** ziarno losowania (te same skoki przy powtórce) */
  seed?: number;
}

/** Prosty, powtarzalny generator liczb losowych. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function generateAim(o: AimOptions): AimNote[] {
  const r = circleRadius(o.cs);
  const d = o.distance * 2 * r;
  const step = 60000 / o.bpm / o.divisor;
  const rand = rng(o.seed ?? 12345);
  const cx = 256;
  const cy = 192;
  const notes: AimNote[] = [];
  // margines: środek kółka nie może wyjść poza planszę
  const minX = r;
  const maxX = 512 - r;
  const minY = r;
  const maxY = 384 - r;

  if (o.pattern === 'backforth') {
    // co 8 skoków zmiana kąta osi, żeby ćwiczyć różne kierunki
    for (let i = 0; i < o.notes; i++) {
      const axis = (Math.floor(i / 8) * 37 + 15) * (Math.PI / 180);
      const side = i % 2 === 0 ? -1 : 1;
      notes.push({
        time: i * step,
        x: clampTo(cx + side * Math.cos(axis) * (d / 2), minX, maxX),
        y: clampTo(cy + side * Math.sin(axis) * (d / 2), minY, maxY),
        combo: (i % 8) + 1
      });
    }
  } else if (o.pattern === 'polygon') {
    const n = Math.max(3, o.sides ?? 3);
    // promień wielokąta tak, żeby bok = odległość skoku
    const R = Math.min(d / (2 * Math.sin(Math.PI / n)), 180);
    for (let i = 0; i < o.notes; i++) {
      const round = Math.floor(i / n);
      const rot = round * 0.35 * (round % 2 ? -1 : 1);
      const ang = rot + (i % n) * ((2 * Math.PI) / n) * (round % 2 ? -1 : 1);
      notes.push({
        time: i * step,
        x: clampTo(cx + Math.cos(ang) * R, minX, maxX),
        y: clampTo(cy + Math.sin(ang) * R, minY, maxY),
        combo: (i % n) + 1
      });
    }
  } else {
    let x = cx;
    let y = cy;
    let dir = rand() * Math.PI * 2;
    for (let i = 0; i < o.notes; i++) {
      if (i > 0) {
        // zmiana kierunku: ostre = zawracanie (kąt między skokami < 60°), szerokie = prawie prosto (> 120°)
        const mode = o.angles ?? 'mixed';
        const turn =
          mode === 'sharp' ? Math.PI - (rand() * Math.PI) / 3 : mode === 'wide' ? (rand() - 0.5) * (Math.PI / 3) : (rand() - 0.5) * Math.PI * 2;
        let ok = false;
        for (let tries = 0; tries < 12 && !ok; tries++) {
          const a = dir + turn * (rand() < 0.5 ? 1 : -1) + (tries ? (rand() - 0.5) * tries * 0.5 : 0);
          const nx = x + Math.cos(a) * d;
          const ny = y + Math.sin(a) * d;
          if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) {
            x = nx;
            y = ny;
            dir = a;
            ok = true;
          }
        }
        if (!ok) {
          // nie mieści się – skok w stronę środka planszy
          const a = Math.atan2(cy - y, cx - x);
          x = clampTo(x + Math.cos(a) * d, minX, maxX);
          y = clampTo(y + Math.sin(a) * d, minY, maxY);
          dir = a;
        }
      }
      notes.push({ time: i * step, x, y, combo: (i % 8) + 1 });
    }
  }
  return notes;
}

export interface AimNoteResult extends AimNote {
  judgement: 300 | 100 | 50 | 0;
  errorMs: number | null;
  /** odległość kliknięcia od środka w promieniach */
  distance: number | null;
  /** położenie kliknięcia względem kierunku skoku, w promieniach: along + = za daleko, across = w bok */
  along: number | null;
  across: number | null;
  miss: 'aim' | 'timing' | null;
}

export interface AimResult {
  notes: AimNoteResult[];
  hitRate: number;
  accuracy: number;
  timing: ErrorStats;
  /** średnia odległość od środka (promienie) */
  meanDistance: number;
  /** średni przestrzał (+) / niedolot (−) w promieniach */
  overshoot: number;
  /** średnie odchylenie w bok (wartość bezwzględna), w promieniach */
  sideways: number;
  aimMisses: number;
  timingMisses: number;
  /** skoki o ostrym kącie wobec szerokich: średnia odległość od środka */
  byAngle: { sharp: number | null; wide: number | null };
}

/**
 * Ocena jak w osu!: kliknięcie dotyczy najwcześniejszej czekającej nuty. Trafienie = kursor w kółku i w oknie 50.
 * Kliknięcie w oknie, ale poza kółkiem = miss „aim”; brak kliknięcia w oknie = miss „timing”.
 */
export function judgeAim(notes: AimNote[], taps: AimTap[], od: number, cs: number): AimResult {
  const w = hitWindows(od);
  const r = circleRadius(cs);
  const res: AimNoteResult[] = notes.map((n) => ({ ...n, judgement: 0, errorMs: null, distance: null, along: null, across: null, miss: null }));
  const strayAim = new Set<number>();
  let p = 0;
  for (const tap of [...taps].sort((a, b) => a.time - b.time)) {
    while (p < res.length && tap.time - res[p]!.time > w.meh) p++;
    const n = res[p];
    if (!n || n.time - tap.time > w.meh) continue;
    const dx = tap.x - n.x;
    const dy = tap.y - n.y;
    const dist = Math.hypot(dx, dy);
    if (dist > r) {
      strayAim.add(p);
      // zapamiętaj najbliższe chybione kliknięcie – do wykresu rozrzutu
      if (n.distance === null || dist / r < n.distance) setOffsets(n, res[p - 1], dx, dy, r);
      continue;
    }
    const err = tap.time - n.time;
    n.errorMs = err;
    n.judgement = Math.abs(err) <= w.great ? 300 : Math.abs(err) <= w.ok ? 100 : 50;
    setOffsets(n, res[p - 1], dx, dy, r);
    p++;
  }
  res.forEach((n, i) => {
    if (n.judgement === 0) n.miss = strayAim.has(i) ? 'aim' : 'timing';
  });

  const hits = res.filter((n) => n.judgement > 0);
  const withPos = res.filter((n) => n.distance !== null);
  const count = (j: number) => res.filter((n) => n.judgement === j).length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  // kąt skoku: między kierunkiem dojścia do nuty a kierunkiem poprzedniego skoku
  const angleAt = (i: number) => {
    const a = res[i - 2];
    const b = res[i - 1];
    const c = res[i];
    if (!a || !b || !c) return null;
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const l = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    return l ? (Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / l))) * 180) / Math.PI : null;
  };
  const sharp: number[] = [];
  const wide: number[] = [];
  res.forEach((n, i) => {
    const ang = angleAt(i);
    if (ang === null || n.distance === null) return;
    if (ang < 60) sharp.push(n.distance);
    else if (ang > 120) wide.push(n.distance);
  });

  return {
    notes: res,
    hitRate: res.length ? (hits.length / res.length) * 100 : 0,
    accuracy: res.length ? ((300 * count(300) + 100 * count(100) + 50 * count(50)) / (300 * res.length)) * 100 : 0,
    timing: errorStats(hits.map((n) => n.errorMs!)),
    meanDistance: avg(withPos.map((n) => n.distance!)) ?? 0,
    overshoot: avg(withPos.filter((n) => n.along !== null).map((n) => n.along!)) ?? 0,
    sideways: avg(withPos.filter((n) => n.across !== null).map((n) => Math.abs(n.across!))) ?? 0,
    aimMisses: res.filter((n) => n.miss === 'aim').length,
    timingMisses: res.filter((n) => n.miss === 'timing').length,
    byAngle: { sharp: avg(sharp), wide: avg(wide) }
  };
}

function setOffsets(n: AimNoteResult, prev: AimNote | undefined, dx: number, dy: number, r: number): void {
  n.distance = Math.hypot(dx, dy) / r;
  if (!prev) {
    n.along = null;
    n.across = null;
    return;
  }
  const jx = n.x - prev.x;
  const jy = n.y - prev.y;
  const len = Math.hypot(jx, jy) || 1;
  n.along = (dx * jx + dy * jy) / len / r;
  n.across = (-dx * jy + dy * jx) / len / r;
}
