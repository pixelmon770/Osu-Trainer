// Trener aimu: generowanie skoków i ocena (timing + celowanie), bez dźwięku i interfejsu.

import type { Beatmap } from './beatmap.ts';
import { beatLengthAt, circleRadius, hitWindows } from './difficulty.ts';
import { playableObjects } from './streams.ts';
import { errorStats, type ErrorStats } from './replayAnalysis.ts';

/**
 * Rodzaje skoków. Nazwy jak w społeczności osu!:
 * - triangles – trójkąty (skoki pod ~60°), obracane i przesuwane po planszy,
 * - star – gwiazda (pentagram): ostre kąty ~36°, każdy skok przez środek kształtu,
 * - square – kwadraty (kąty 90°), co obrót kwadrat obraca się o 45°,
 * - oibon – skoki przez cały ekran, z lewej krawędzi na prawą i z powrotem,
 * - flow – płynne skoki pod szerokim kątem (łuki i „esy”), jak w mapach na wide aim.
 */
export type AimPattern = 'backforth' | 'polygon' | 'random' | 'triangles' | 'star' | 'square' | 'oibon' | 'flow';
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
  } else if (o.pattern === 'triangles' || o.pattern === 'star' || o.pattern === 'square') {
    // kształt o boku = odległość skoku; po każdym obiegu obrót i przesunięcie, kierunek na zmianę
    const n = o.pattern === 'triangles' ? 3 : o.pattern === 'square' ? 4 : 5;
    // gwiazda: wierzchołki pięciokąta odwiedzane co drugi (cięciwa 144°), reszta – po kolei
    const order = o.pattern === 'star' ? [0, 2, 4, 1, 3] : [...Array(n).keys()];
    const chordAngle = o.pattern === 'star' ? (4 * Math.PI) / 5 : (2 * Math.PI) / n;
    const R = Math.min(d / (2 * Math.sin(chordAngle / 2)), 175);
    let ox = cx;
    let oy = cy;
    let rot = rand() * Math.PI * 2;
    for (let i = 0; i < o.notes; i++) {
      const round = Math.floor(i / n);
      if (i > 0 && i % n === 0) {
        rot += o.pattern === 'square' ? Math.PI / 4 : (0.35 + rand() * 0.5) * (round % 2 ? 1 : -1);
        // środek kształtu wędruje, ale cały kształt mieści się na planszy
        ox = clampTo(ox + (rand() - 0.5) * R, minX + R, maxX - R);
        oy = clampTo(oy + (rand() - 0.5) * R * 0.8, minY + R, maxY - R);
        if (maxX - minX < 2 * R) ox = cx;
        if (maxY - minY < 2 * R) oy = cy;
      }
      const dirSign = round % 2 ? -1 : 1;
      const k = order[i % n]!;
      const ang = rot + dirSign * k * ((2 * Math.PI) / n);
      notes.push({
        time: i * step,
        x: clampTo(ox + Math.cos(ang) * R, minX, maxX),
        y: clampTo(oy + Math.sin(ang) * R, minY, maxY),
        combo: (i % n) + 1
      });
    }
  } else if (o.pattern === 'oibon') {
    // od krawędzi do krawędzi; wysokość wędruje w dół i w górę, żeby kąty się zmieniały
    let y = minY + rand() * (maxY - minY);
    let vy = (d * 0.25 + 20) * (rand() < 0.5 ? 1 : -1);
    for (let i = 0; i < o.notes; i++) {
      const left = i % 2 === 0;
      if (i > 0) {
        y += vy * (0.6 + rand() * 0.8);
        if (y < minY || y > maxY) {
          vy = -vy;
          y = clampTo(y, minY, maxY);
        }
      }
      notes.push({ time: i * step, x: left ? minX + r * 0.3 : maxX - r * 0.3, y, combo: (i % 8) + 1 });
    }
  } else if (o.pattern === 'flow') {
    // płynny ruch: skręt 30–66° (kąt między skokami 114–150°), łuki w jedną stronę, co kilka nut „es”.
    // Skręt wybierany tak, żeby zmieściła się ta nuta i następna przy tym samym skręcie –
    // dzięki temu przy krawędzi ruch zakręca łukiem zamiast ostro zawracać.
    const inside = (px: number, py: number) => px >= minX && px <= maxX && py >= minY && py <= maxY;
    // 30–66° to płynny ruch; większe skręty tylko gdy plansza nie pozwala inaczej (duże odległości)
    const MAGS = [0.55, 0.75, 0.95, 1.15, 1.35, 1.6, 1.9, 2.3, 2.7];
    let x = clampTo(cx - d / 2, minX, maxX);
    let y = cy;
    let dir = rand() * Math.PI * 2;
    let turnSign = rand() < 0.5 ? 1 : -1;
    let nextFlip = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < o.notes; i++) {
      if (i > 0) {
        if (i === nextFlip) {
          turnSign = -turnSign;
          nextFlip = i + 5 + Math.floor(rand() * 4);
        }
        let best: { x: number; y: number; dir: number; score: number } | null = null;
        for (const sign of [turnSign, -turnSign]) {
          for (const mag of MAGS) {
            const a1 = dir + sign * mag;
            const x1 = x + Math.cos(a1) * d;
            const y1 = y + Math.sin(a1) * d;
            if (!inside(x1, y1)) continue;
            const a2 = a1 + sign * mag;
            const ok2 = inside(x1 + Math.cos(a2) * d, y1 + Math.sin(a2) * d);
            // najpierw: następny skok się mieści; potem: bez zmiany strony; potem: łagodniejszy skręt
            const score = (ok2 ? 0 : 100) + (sign === turnSign ? 0 : 3) + mag * 6;
            if (!best || score < best.score) best = { x: x1, y: y1, dir: a1, score };
          }
        }
        if (best) {
          if (Math.sign(best.dir - dir) !== turnSign) turnSign = -turnSign;
          x = best.x;
          y = best.y;
          dir = best.dir;
        } else {
          // nic się nie mieści (bardzo duża odległość) – skok w stronę środka
          const a = Math.atan2(cy - y, cx - x);
          x = clampTo(x + Math.cos(a) * d, minX, maxX);
          y = clampTo(y + Math.sin(a) * d, minY, maxY);
          dir = a;
        }
      }
      notes.push({ time: i * step, x, y, combo: (i % 8) + 1 });
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

export interface MapJumpSection {
  /** czas w oryginalnej mapie (ms) */
  startMs: number;
  endMs: number;
  notes: number;
  /** średnia długość skoku w średnicach */
  distance: number;
}

export interface MapJumpOptions {
  /** minimalny skok (w średnicach), żeby przejście liczyło się jako skok */
  minDistance?: number;
  /** tempo względem mapy: 0,75 = wolniej, 1,5 = jak DT */
  rate?: number;
  /** najkrótszy fragment skoków (nuty) */
  minNotes?: number;
  /** pauza między fragmentami w ćwiczeniu (ms) */
  gapMs?: number;
  /** limit nut w ćwiczeniu */
  maxNotes?: number;
}

/**
 * Skoki wycięte z prawdziwej mapy: fragmenty, w których kolejne obiekty dzieli najwyżej 1/2 uderzenia
 * i duża odległość. Pozycje i rytm jak w mapie (z tempem rate), fragmenty sklejone krótkimi pauzami.
 * Odległość liczona od końca poprzedniego obiektu (slider kończy się gdzie indziej niż zaczyna).
 */
export function aimFromBeatmap(beatmap: Beatmap, o: MapJumpOptions = {}): { notes: AimNote[]; sections: MapJumpSection[]; cs: number } {
  const minDistance = o.minDistance ?? 1.5;
  const rate = o.rate ?? 1;
  const minNotes = o.minNotes ?? 4;
  const gapMs = o.gapMs ?? 1200;
  const maxNotes = o.maxNotes ?? 400;
  const r = circleRadius(beatmap.difficulty.cs);
  const objs = playableObjects(beatmap).filter((h) => h.kind !== 'spinner');
  const runs: (typeof objs)[] = [];
  let run: typeof objs = [];
  const close = () => {
    if (run.length >= minNotes) runs.push(run);
    run = [];
  };
  for (let i = 1; i < objs.length; i++) {
    const a = objs[i - 1]!;
    const b = objs[i]!;
    const beat = beatLengthAt(beatmap, b.time);
    const gap = b.time - a.endTime;
    const dist = Math.hypot(b.x - a.endX, b.y - a.endY) / (2 * r);
    // 1/2 albo szybciej (ale nie stream 1/4 na małym spacingu) i duża odległość
    if (gap > 0 && gap <= beat * 0.55 && dist >= minDistance) {
      if (!run.length) run.push(a);
      run.push(b);
    } else {
      close();
    }
  }
  close();

  const notes: AimNote[] = [];
  const sections: MapJumpSection[] = [];
  let t = 0;
  for (const part of runs) {
    if (notes.length >= maxNotes) break;
    const take = part.slice(0, maxNotes - notes.length);
    const t0 = take[0]!.time;
    let sum = 0;
    take.forEach((h, k) => {
      notes.push({ time: t + (h.time - t0) / rate, x: h.x, y: h.y, combo: (k % 8) + 1 });
      if (k > 0) sum += Math.hypot(h.x - take[k - 1]!.endX, h.y - take[k - 1]!.endY) / (2 * r);
    });
    sections.push({ startMs: t0, endMs: take[take.length - 1]!.time, notes: take.length, distance: sum / Math.max(take.length - 1, 1) });
    t = notes[notes.length - 1]!.time + gapMs;
  }
  return { notes, sections, cs: beatmap.difficulty.cs };
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
