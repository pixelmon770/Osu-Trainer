// Proste wykresy w HTML/SVG, rozciągają się na szerokość karty.
// Kolory serii K1/K2 sprawdzone pod kątem daltonizmu na ciemnym tle (#5b8def / #d07a3c).

import type { Segment } from '@osu-trainer/analyzer';
import { useTranslation } from 'react-i18next';
import type { Formatters } from '../format.ts';
import { formatTime } from '../format.ts';

// ---------- rozkład hit errorów ----------

export function HitErrorChart({
  notes,
  windows,
  f
}: {
  /** wystarczy błąd w ms i klawisz (replay: NoteResult, ćwiczenie: errorMs + tapFinger) */
  notes: { errorMs: number | null; key: string | null }[];
  windows: { great: number; ok: number; meh: number };
  f: Formatters;
}) {
  const { t } = useTranslation();
  const BIN = 5;
  const limit = Math.ceil(windows.meh / BIN) * BIN;
  const bins: { from: number; k1: number; k2: number }[] = [];
  for (let from = -limit; from < limit; from += BIN) bins.push({ from, k1: 0, k2: 0 });
  for (const n of notes) {
    if (n.errorMs === null) continue;
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor((n.errorMs + limit) / BIN)));
    if (n.key === 'K2' || n.key === 'M2') bins[i]!.k2++;
    else bins[i]!.k1++;
  }
  const max = Math.max(1, ...bins.map((b) => b.k1 + b.k2));
  const pct = (ms: number) => ((ms + limit) / (2 * limit)) * 100;

  return (
    <div className="chart">
      <div className="legend">
        <span className="legend-item">
          <i className="swatch k1" /> K1
        </span>
        <span className="legend-item">
          <i className="swatch k2" /> K2
        </span>
        <span className="legend-note">{t('replay.chart.windowsNote', { great: f.num(windows.great), ok: f.num(windows.ok) })}</span>
      </div>
      <div className="hit-chart">
        <div className="band ok" style={{ left: `${pct(-windows.ok)}%`, width: `${pct(windows.ok) - pct(-windows.ok)}%` }} />
        <div className="band great" style={{ left: `${pct(-windows.great)}%`, width: `${pct(windows.great) - pct(-windows.great)}%` }} />
        <div className="zero" style={{ left: '50%' }} />
        <div className="hit-bars">
          {bins.map((b) => (
            <div
              key={b.from}
              className="hit-bin"
              title={`${f.signed(b.from, 0)} … ${f.signed(b.from + BIN, 0)} ms · K1 ${b.k1} · K2 ${b.k2}`}
            >
              {b.k2 > 0 && <span className="seg k2" style={{ height: `${(b.k2 / max) * 100}%` }} />}
              {b.k1 > 0 && <span className="seg k1" style={{ height: `${(b.k1 / max) * 100}%` }} />}
            </div>
          ))}
        </div>
      </div>
      <div className="axis">
        <span>{t('replay.chart.early', { ms: f.num(limit) })}</span>
        <span>0</span>
        <span>{t('replay.chart.late', { ms: f.num(limit) })}</span>
      </div>
    </div>
  );
}

// ---------- średni błąd według pozycji w streamie (rozbieżne słupki od zera) ----------

export function StreamPositionChart({
  rows,
  f
}: {
  rows: { range: string; errors: { count: number; mean: number; ur: number }; misses: number; notes: number }[];
  f: Formatters;
}) {
  const { t } = useTranslation();
  const visible = rows.filter((r) => r.notes > 0);
  const max = Math.max(5, ...visible.map((r) => Math.abs(r.errors.mean)));
  return (
    <div className="chart">
      <div className="div-head">
        <span className="div-head-axis">
          <span>{t('replay.chart.earlier')}</span>
          <span>{t('replay.chart.later')}</span>
        </span>
      </div>
      {visible.map((r) => {
        const w = (Math.abs(r.errors.mean) / max) * 50;
        return (
          <div
            key={r.range}
            className="div-row"
            title={t('replay.chart.positionTip', { range: r.range, notes: r.notes, ur: f.num(r.errors.ur), misses: r.misses })}
          >
            <span className="div-label">{t('replay.chart.notesRange', { range: r.range })}</span>
            <span className="div-track">
              <span className="div-zero" />
              <span
                className="div-bar"
                style={r.errors.mean >= 0 ? { left: '50%', width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }}
              />
            </span>
            <span className="div-value">{f.signed(r.errors.mean)} ms</span>
            <span className="div-extra">
              UR {f.num(r.errors.ur)} · {t('replay.chart.missesShort', { count: r.misses })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- celność w czasie ----------

export function TimelineChart({ segments, fatigueAt, f }: { segments: Segment[]; fatigueAt: number | null; f: Formatters }) {
  const { t } = useTranslation();
  if (segments.length === 0) return null;
  const lo = Math.max(0, Math.floor(Math.min(...segments.map((s) => s.accuracy)) / 5) * 5 - 5);
  const x = (i: number) => (segments.length === 1 ? 50 : (i / (segments.length - 1)) * 100);
  const y = (acc: number) => 100 - ((acc - lo) / (100 - lo)) * 100;
  const points = segments.map((s, i) => `${x(i)},${y(s.accuracy)}`).join(' ');
  const ticks = [100, lo + (100 - lo) / 2, lo];

  return (
    <div className="chart">
      <div className="line-chart">
        <div className="y-axis">
          {ticks.map((v) => (
            <span key={v}>{f.num(v)}%</span>
          ))}
        </div>
        <div className="plot">
          {ticks.map((v) => (
            <div key={v} className="grid-line" style={{ top: `${y(v)}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={points} fill="none" stroke="#8c7ae6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {segments.map((s, i) => (
            <span
              key={s.startMs}
              className={`dot${fatigueAt === s.startMs ? ' marked' : ''}`}
              style={{ left: `${x(i)}%`, top: `${y(s.accuracy)}%` }}
              title={t('replay.chart.segmentTip', {
                from: formatTime(s.startMs),
                to: formatTime(s.endMs),
                acc: f.num(s.accuracy, 1),
                ur: f.num(s.errors.ur),
                misses: s.misses
              })}
            />
          ))}
        </div>
      </div>
      <div className="x-axis" style={{ paddingLeft: '44px' }}>
        {segments.map((s, i) => (
          <span key={s.startMs} style={{ left: `calc(44px + (100% - 44px) * ${x(i) / 100})` }}>
            {formatTime(s.startMs)}
          </span>
        ))}
      </div>
    </div>
  );
}
