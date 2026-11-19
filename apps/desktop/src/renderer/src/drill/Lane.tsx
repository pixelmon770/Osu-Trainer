// Tor z nutami: nuty jadą od prawej do linii trafienia, kolor = palec (K1 niebieski, K2 pomarańczowy).
// Pod torem hit error w dwóch rzędach (K1 / K2) – ostatnie tapnięcia, starsze bledną.
// Rysowane na canvas w requestAnimationFrame, bez przerysowywania Reacta przy każdym tapnięciu.

import { hitWindows, type DrillNote } from '@osu-trainer/analyzer';
import { useEffect, useRef } from 'react';
import type { DrillSession } from './engine.ts';

const COLORS = { K1: '#5b8def', K2: '#d07a3c', any: '#8b8f98', text: '#d4d6db', muted: '#8b8f98', line: '#c9b8ff' };

interface Props {
  session: DrillSession;
  notes: DrillNote[];
  od: number;
  /** ile ms przed linią widać nuty */
  previewMs?: number;
}

interface Judged {
  error: number | null;
  missed: boolean;
}

export default function Lane({ session, notes, od, previewMs = 1100 }: Props) {
  const laneRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const lane = laneRef.current!;
    const meter = meterRef.current!;
    const w = hitWindows(od);
    const judged: Judged[] = notes.map(() => ({ error: null, missed: false }));
    const recent: { error: number; finger: 'K1' | 'K2'; at: number }[] = [];
    let processed = 0;
    let p = 0;
    let raf = 0;

    const fit = (c: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, width: r.width, height: r.height };
    };

    const frame = () => {
      const now = session.nowMs();

      // nowe tapnięcia → przypisanie do nut (jak w ocenie końcowej)
      while (processed < session.taps.length) {
        const tap = session.taps[processed++]!;
        while (p < notes.length && tap.time - notes[p]!.time > w.meh) p++;
        const n = notes[p];
        if (n && n.time - tap.time <= w.meh) {
          judged[p]!.error = tap.time - n.time;
          recent.push({ error: tap.time - n.time, finger: tap.finger, at: now });
          p++;
        }
      }
      for (let i = 0; i < notes.length && notes[i]!.time < now - w.meh; i++) {
        if (judged[i]!.error === null) judged[i]!.missed = true;
      }

      // ---- tor ----
      const { ctx, width, height } = fit(lane);
      ctx.clearRect(0, 0, width, height);
      const hitX = Math.max(60, width * 0.14);
      const pxPerMs = (width - hitX - 20) / previewMs;
      const mid = height / 2;
      const radius = Math.min(height * 0.28, 22);

      // okna oceny przy linii
      const band = (ms: number, alpha: number) => {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(hitX - ms * pxPerMs, 6, ms * 2 * pxPerMs, height - 12);
      };
      band(w.meh, 0.025);
      band(w.ok, 0.035);
      band(w.great, 0.05);
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitX, 4);
      ctx.lineTo(hitX, height - 4);
      ctx.stroke();

      // odliczanie przed startem
      if (now < 0) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '600 28px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.ceil(-now / session.beatMs)), width / 2, mid);
      }

      for (let i = 0; i < notes.length; i++) {
        const n = notes[i]!;
        const dt = n.time - now;
        if (dt < -350) continue;
        if (dt > previewMs) break;
        const x = hitX + dt * pxPerMs;
        const j = judged[i]!;
        const color = n.finger ? COLORS[n.finger] : COLORS.any;
        let alpha = 1;
        if (j.error !== null) alpha = 0.18;
        else if (j.missed) alpha = 0.45;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = j.missed ? '#3a3d44' : color;
        ctx.beginPath();
        ctx.arc(x, mid, radius, 0, Math.PI * 2);
        ctx.fill();
        if (n.accent) {
          ctx.strokeStyle = '#f1f2f4';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, mid, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (n.finger && radius >= 14) {
          ctx.fillStyle = '#0f1012';
          ctx.font = `700 ${Math.round(radius * 0.7)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.finger === 'K1' ? 'L' : 'P', x, mid + 1);
        }
        ctx.globalAlpha = 1;
      }

      // ---- hit error w dwóch rzędach ----
      const m = fit(meter);
      m.ctx.clearRect(0, 0, m.width, m.height);
      const cx = m.width / 2;
      const scale = (m.width / 2 - 30) / w.meh;
      const rowH = m.height / 2;
      (['K1', 'K2'] as const).forEach((finger, row) => {
        const y = row * rowH + rowH / 2;
        m.ctx.fillStyle = 'rgba(255,255,255,0.04)';
        m.ctx.fillRect(cx - w.ok * scale, y - 6, w.ok * 2 * scale, 12);
        m.ctx.fillStyle = 'rgba(255,255,255,0.07)';
        m.ctx.fillRect(cx - w.great * scale, y - 6, w.great * 2 * scale, 12);
        m.ctx.fillStyle = COLORS.muted;
        m.ctx.font = '600 11px Inter, system-ui, sans-serif';
        m.ctx.textAlign = 'left';
        m.ctx.textBaseline = 'middle';
        m.ctx.fillText(finger, 4, y);
      });
      m.ctx.fillStyle = COLORS.line;
      m.ctx.fillRect(cx - 1, 2, 2, m.height - 4);
      while (recent.length > 60) recent.shift();
      for (const r of recent) {
        const age = (now - r.at) / 2500;
        if (age > 1) continue;
        const y = (r.finger === 'K1' ? 0 : 1) * rowH + rowH / 2;
        m.ctx.globalAlpha = 1 - age * 0.85;
        m.ctx.fillStyle = COLORS[r.finger];
        m.ctx.fillRect(cx + Math.max(-w.meh, Math.min(w.meh, r.error)) * scale - 1.5, y - 9, 3, 18);
      }
      m.ctx.globalAlpha = 1;

      if (!session.isStopped) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [session, notes, od, previewMs]);

  return (
    <div className="lane-wrap">
      <canvas ref={laneRef} className="lane" />
      <canvas ref={meterRef} className="lane-meter" />
    </div>
  );
}
