// Rysowanie planszy osu! dla Analizatora klatek: kółka z kółkami zbliżania, slidery z kulką,
// numery combo, oceny, kursor ze śladem i znacznikami kliknięć, podświetlone klawisze.

import { hitWindows, type NoteResult } from '@osu-trainer/analyzer';
import type { PlaybackData, PlaybackObject } from '../../../shared/api.ts';

const COMBO_COLORS = ['#ffc000', '#00ca00', '#127cff', '#f21839'];
const JUDGE_COLORS: Record<number, string> = { 300: '#66ccff', 100: '#88e05a', 50: '#ffb84d', 0: '#ff5a5a' };
export const KEY_COLORS = { K1: '#5b8def', K2: '#d07a3c', M1: '#8b8f98', M2: '#8b8f98' };

export interface Prepared {
  data: PlaybackData;
  /** długości ścieżek sliderów (do pozycji kulki) */
  pathLen: Map<number, number[]>;
  /** czas zniknięcia obiektu: trafienie albo koniec okna 50 */
  goneAt: number[];
  od: number;
}

export function prepare(data: PlaybackData): Prepared {
  const pathLen = new Map<number, number[]>();
  data.objects.forEach((o, i) => {
    if (!o.path) return;
    const acc = [0];
    for (let k = 1; k < o.path.length; k++) acc.push(acc[k - 1]! + Math.hypot(o.path[k]!.x - o.path[k - 1]!.x, o.path[k]!.y - o.path[k - 1]!.y));
    pathLen.set(i, acc);
  });
  const od = data.analysis.difficulty.od;
  const w = hitWindows(od);
  const goneAt = data.objects.map((o) => {
    if (o.kind === 'spinner') return o.endTime;
    const n = data.analysis.notes[o.noteIndex];
    if (o.kind === 'slider') return o.endTime;
    if (n && n.errorMs !== null) return o.time + n.errorMs;
    return o.time + w.meh;
  });
  return { data, pathLen, goneAt, od };
}

/** Pozycja kursora w czasie t (interpolacja między klatkami). */
export function cursorAt(frames: PlaybackData['frames'], t: number): { x: number; y: number; keys: number; index: number } {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]![0] <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo]!;
  const b = frames[lo + 1];
  if (!b || b[0] <= a[0] || t <= a[0]) return { x: a[1], y: a[2], keys: a[3], index: lo };
  const k = (t - a[0]) / (b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, keys: a[3], index: lo };
}

function pointOnPath(o: PlaybackObject, lens: number[], progress: number): { x: number; y: number } {
  const path = o.path!;
  const total = lens[lens.length - 1]!;
  const target = Math.max(0, Math.min(1, progress)) * total;
  let i = 1;
  while (i < lens.length - 1 && lens[i]! < target) i++;
  const seg = lens[i]! - lens[i - 1]! || 1;
  const k = (target - lens[i - 1]!) / seg;
  return { x: path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * k, y: path[i - 1]!.y + (path[i]!.y - path[i - 1]!.y) * k };
}

export function draw(ctx: CanvasRenderingContext2D, width: number, height: number, p: Prepared, t: number): void {
  const { data } = p;
  ctx.clearRect(0, 0, width, height);
  // margines w osu!pikselach: obiekty mogą lekko wychodzić poza planszę, a kółka zbliżania są 4× większe
  const padX = data.radius * 1.6 + 40;
  const padY = data.radius * 1.2 + 20;
  const scale = Math.min(width / (512 + padX * 2), height / (384 + padY * 2));
  const ox = (width - 512 * scale) / 2;
  const oy = (height - 384 * scale) / 2;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;
  const r = data.radius * scale;

  // obramowanie planszy
  ctx.fillStyle = '#0b0c0e';
  ctx.fillRect(ox, oy, 512 * scale, 384 * scale);
  ctx.strokeStyle = '#2a2c31';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, 512 * scale, 384 * scale);

  const preempt = data.preempt;
  const fadeIn = Math.min(400, preempt * 0.66);

  // widoczne obiekty: od t - (czas po zniknięciu) do t + preempt; wcześniejsze rysowane na wierzchu
  const visible: number[] = [];
  for (let i = 0; i < data.objects.length; i++) {
    const o = data.objects[i]!;
    if (o.time - preempt > t) break;
    if (p.goneAt[i]! + 350 < t) continue;
    visible.push(i);
  }

  for (let v = visible.length - 1; v >= 0; v--) {
    const i = visible[v]!;
    const o = data.objects[i]!;
    const note: NoteResult | undefined = o.noteIndex >= 0 ? data.analysis.notes[o.noteIndex] : undefined;
    const color = COMBO_COLORS[o.comboIndex % COMBO_COLORS.length]!;
    const gone = p.goneAt[i]!;
    let alpha = Math.min(1, (t - (o.time - preempt)) / fadeIn);
    if (data.hidden) alpha = t < o.time - preempt * 0.6 ? alpha : Math.max(0, 1 - (t - (o.time - preempt * 0.6)) / (preempt * 0.3));
    if (t > gone) alpha = Math.max(0, 1 - (t - gone) / 200);

    if (o.kind === 'spinner') {
      if (t >= o.time - 300 && t <= o.endTime + 200) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#c9b8ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(X(256), Y(192), 150 * scale * Math.max(0.05, 1 - (t - o.time) / Math.max(1, o.endTime - o.time)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      continue;
    }

    // ciało slidera
    if (o.kind === 'slider' && o.path && o.path.length > 1) {
      const sliderAlpha = t > o.endTime ? Math.max(0, 1 - (t - o.endTime) / 200) : Math.min(1, (t - (o.time - preempt)) / fadeIn);
      ctx.globalAlpha = sliderAlpha * 0.9;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(X(o.path[0]!.x), Y(o.path[0]!.y));
      for (const pt of o.path) ctx.lineTo(X(pt.x), Y(pt.y));
      ctx.strokeStyle = '#d4d6db';
      ctx.lineWidth = r * 2;
      ctx.stroke();
      ctx.strokeStyle = '#1b1c20';
      ctx.lineWidth = r * 2 - 4 * scale;
      ctx.stroke();
      ctx.strokeStyle = color + '55';
      ctx.stroke();
      // kulka slidera
      if (t >= o.time && t <= o.endTime) {
        const span = (o.endTime - o.time) / o.slides;
        const k = (t - o.time) / span;
        const rep = Math.floor(k);
        const frac = rep % 2 === 0 ? k - rep : 1 - (k - rep);
        const ball = pointOnPath(o, p.pathLen.get(i)!, frac);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#f1f2f4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(ball.x), Y(ball.y), r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(ball.x), Y(ball.y), r * 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(241,242,244,0.35)';
        ctx.stroke();
      }
    }

    // główka: kółko + numer + kółko zbliżania
    const headGone = o.kind === 'slider' ? (note?.errorMs != null ? o.time + note.errorMs : o.time + hitWindows(p.od).meh) : gone;
    if (t <= headGone + 200) {
      const headAlpha = t > headGone ? Math.max(0, 1 - (t - headGone) / 200) : alpha;
      ctx.globalAlpha = headAlpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(o.x), Y(o.y), r * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f1f2f4';
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.stroke();
      ctx.fillStyle = '#0f1012';
      ctx.font = `700 ${Math.round(r * 0.8)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(o.combo), X(o.x), Y(o.y) + 1);
      if (t < o.time && !data.hidden) {
        const ar = 1 + 3 * ((o.time - t) / preempt);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, r * 0.08);
        ctx.beginPath();
        ctx.arc(X(o.x), Y(o.y), r * ar, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ocena po trafieniu / missie
    if (note && t >= headGone && t < headGone + 600) {
      ctx.globalAlpha = 1 - (t - headGone) / 600;
      ctx.fillStyle = JUDGE_COLORS[note.judgement]!;
      ctx.font = `800 ${Math.round(r * (note.judgement === 0 ? 1 : 0.7))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = note.judgement === 0 ? '✕' : note.judgement === 300 ? '' : String(note.judgement);
      if (label) ctx.fillText(label, X(o.x), Y(o.y) - r * 1.2);
    }
    ctx.globalAlpha = 1;
  }

  // kursor ze śladem (ostatnie 250 ms) i miejscami kliknięć
  const frames = data.frames;
  const cur = cursorAt(frames, t);
  let start = cur.index;
  while (start > 0 && frames[start - 1]![0] > t - 250) start--;
  ctx.lineCap = 'round';
  for (let k = start + 1; k <= cur.index; k++) {
    const a = frames[k - 1]!;
    const b = frames[k]!;
    ctx.globalAlpha = Math.max(0.05, 1 - (t - b[0]) / 250) * 0.8;
    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(a[1]), Y(a[2]));
    ctx.lineTo(X(b[1]), Y(b[2]));
    ctx.stroke();
    const newKeys = b[3] & ~a[3];
    if (newKeys & 3) {
      ctx.fillStyle = newKeys & 4 ? KEY_COLORS.K1 : newKeys & 8 ? KEY_COLORS.K2 : KEY_COLORS.M1;
      ctx.beginPath();
      ctx.arc(X(b[1]), Y(b[2]), 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f1f2f4';
  ctx.strokeStyle = '#0f1012';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(X(cur.x), Y(cur.y), 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // klawisze
  const keys: [string, boolean, string][] = [
    ['K1', !!(cur.keys & 4), KEY_COLORS.K1],
    ['K2', !!(cur.keys & 8), KEY_COLORS.K2],
    ['M1', !!(cur.keys & 1) && !(cur.keys & 4), KEY_COLORS.M1],
    ['M2', !!(cur.keys & 2) && !(cur.keys & 8), KEY_COLORS.M2]
  ];
  keys.forEach(([label, on, color], k) => {
    const bx = width - 46;
    const by = height / 2 - 70 + k * 36;
    ctx.fillStyle = on ? color : '#1b1c20';
    ctx.strokeStyle = '#2a2c31';
    ctx.fillRect(bx, by, 36, 28);
    ctx.strokeRect(bx, by, 36, 28);
    ctx.fillStyle = on ? '#0f1012' : '#8b8f98';
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 18, by + 14);
  });
}
