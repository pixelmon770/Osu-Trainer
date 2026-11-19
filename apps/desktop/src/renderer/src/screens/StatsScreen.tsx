import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatsQuery, StatsResult, StatsTotals } from '../../../shared/api.ts';
import TrendChart from '../components/TrendChart.tsx';
import { makeFormatters, type Formatters } from '../format.ts';

const QUERY_KEY = 'osu-trainer.statsQuery';

export interface OpenMap {
  beatmapMd5: string;
  title: string;
  version: string;
}

function loadQuery(): StatsQuery {
  try {
    return { sinceDays: 30, source: 'all', hidePartial: false, mods: null, ...JSON.parse(localStorage.getItem(QUERY_KEY) ?? '{}') };
  } catch {
    return { sinceDays: 30, source: 'all', hidePartial: false, mods: null };
  }
}

/** Jak opisać zmianę: dla części miar lepiej mniej (UR), dla części więcej (celność), dla części bliżej zera. */
type Better = 'up' | 'down' | 'zero';

export default function StatsScreen({ onOpenMap }: { onOpenMap: (m: OpenMap) => void }) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const [q, setQ] = useState<StatsQuery>(loadQuery);
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [mods, setMods] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(QUERY_KEY, JSON.stringify(q));
    } catch {
      // brak pamięci – trudno
    }
    void window.api.stats(q).then(setStats);
  }, [q]);

  useEffect(() => {
    void window.api.modCombos().then(setMods);
    // nowy replay w tle = świeże statystyki
    return window.api.onReplayAdded(() => void window.api.stats(q).then(setStats));
  }, [q]);

  // dopóki program uzupełnia BPM starszych gier, odświeżaj co kilka sekund
  useEffect(() => {
    if (!stats?.missingBpm) return;
    const timer = setTimeout(() => void window.api.stats(q).then(setStats), 3000);
    return () => clearTimeout(timer);
  }, [stats, q]);

  const set = (patch: Partial<StatsQuery>) => setQ((old) => ({ ...old, ...patch }));
  const periodLabel = q.sinceDays ? t('stats.previousDays', { count: q.sinceDays }) : '';
  const p = stats?.period;
  const prev = stats?.previous ?? null;

  const dayFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const label = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    const text = dayFmt.format(new Date(y!, m! - 1, d!));
    return stats?.granularity === 'week' ? t('stats.weekOf', { date: text }) : text;
  };
  const trend = (pick: (b: StatsTotals) => number | null) =>
    (stats?.buckets ?? [])
      .filter((b) => pick(b) !== null)
      .map((b) => ({ id: b.key, label: label(b.key), tip: `${label(b.key)} · ${t('stats.plays', { count: b.plays })}`, value: pick(b)! }));

  return (
    <div className="screen stats">
      <header className="screen-head">
        <h1>{t('stats.title')}</h1>
        <p className="muted">{t('stats.subtitle')}</p>
      </header>

      <div className="stats-filters">
        <div className="segmented" role="tablist" aria-label={t('replay.filter.period')}>
          {[7, 30, 90, null].map((d) => (
            <button key={String(d)} type="button" role="tab" aria-selected={q.sinceDays === d} className={q.sinceDays === d ? 'on' : ''} onClick={() => set({ sinceDays: d })}>
              {d ? t('stats.days', { count: d }) : t('replay.filter.allTime')}
            </button>
          ))}
        </div>
        <select value={q.mods ?? ''} onChange={(e) => set({ mods: e.target.value || null })} aria-label={t('replay.filter.mods')}>
          <option value="">{t('replay.filter.anyMods')}</option>
          {mods.map((m) => (
            <option key={m} value={m}>
              {m === 'NM' ? t('replay.filter.noMods') : m.split(',').join('')}
            </option>
          ))}
        </select>
        <select value={q.source ?? 'all'} onChange={(e) => set({ source: e.target.value as StatsQuery['source'] })} aria-label={t('replay.filter.source')}>
          <option value="all">{t('replay.filter.anyClient')}</option>
          <option value="stable">stable</option>
          <option value="lazer">lazer</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={!!q.hidePartial} onChange={(e) => set({ hidePartial: e.target.checked })} />
          {t('replay.filter.hidePartial')}
        </label>
      </div>

      {stats && stats.missingBpm > 0 && <p className="muted small">{t('stats.computingBpm', { count: stats.missingBpm })}</p>}

      {p && p.plays === 0 && (
        <div className="card soon-card">
          <p className="muted">{t('stats.empty')}</p>
        </div>
      )}

      {p && p.plays > 0 && (
        <>
          <div className="grid stats-tiles">
            <DeltaStat label={t('stats.playsLabel')} value={f.num(p.plays)} now={p.plays} before={prev?.plays} better="up" f={f} digits={0} periodLabel={periodLabel} neutral />
            <DeltaStat label={t('replay.progress.accuracy')} value={`${f.num(p.accuracy, 2)}%`} now={p.accuracy} before={prev?.accuracy} better="up" f={f} digits={2} unit=" pp" periodLabel={periodLabel} />
            <DeltaStat label="UR" value={f.num(p.ur)} now={p.ur} before={prev?.ur} better="down" f={f} digits={0} periodLabel={periodLabel} />
            <DeltaStat label="K2−K1" value={`${f.signed(p.k2k1)} ms`} now={p.k2k1} before={prev?.k2k1} better="zero" f={f} digits={1} unit=" ms" periodLabel={periodLabel} />
            {p.entry !== null && (
              <DeltaStat label={t('replay.progress.entry')} value={`${f.signed(p.entry)} ms`} now={p.entry} before={prev?.entry ?? undefined} better="zero" f={f} digits={1} unit=" ms" periodLabel={periodLabel} />
            )}
            {p.streamUr !== null && (
              <DeltaStat label={t('replay.streamUr')} value={f.num(p.streamUr)} now={p.streamUr} before={prev?.streamUr ?? undefined} better="down" f={f} digits={0} periodLabel={periodLabel} />
            )}
          </div>

          <h2>{stats.granularity === 'week' ? t('stats.trendWeeks') : t('stats.trendDays')}</h2>
          {stats.buckets.length < 2 ? (
            <p className="muted small">{t('stats.needMoreDays')}</p>
          ) : (
            <div className="trend-grid">
              <TrendChart title={t('replay.progress.accuracy')} betterHint={t('replay.progress.higherBetter')} points={trend((b) => b.accuracy)} format={(v) => `${f.num(v, 1)}%`} />
              <TrendChart title="UR" betterHint={t('replay.progress.lowerBetter')} points={trend((b) => b.ur)} format={(v) => f.num(v)} />
              <TrendChart title="K2−K1" betterHint={t('replay.progress.closerZero')} points={trend((b) => b.k2k1)} format={(v) => `${f.signed(v, 0)} ms`} zeroLine />
              <TrendChart title={t('replay.progress.entry')} betterHint={t('replay.progress.closerZero')} points={trend((b) => b.entry)} format={(v) => `${f.signed(v, 0)} ms`} zeroLine />
            </div>
          )}

          {stats.byBpm.length > 0 && (
            <>
              <h2>{t('stats.byBpm')}</h2>
              <div className="card">
                <p className="muted small">{t('stats.byBpmHint')}</p>
                <BpmTable rows={stats.byBpm} f={f} />
              </div>
            </>
          )}

          {stats.topMaps.length > 0 && (
            <>
              <h2>{t('stats.topMaps')}</h2>
              <div className="top-maps">
                {stats.topMaps.map((m) => (
                  <div key={m.beatmapMd5} className="card top-map">
                    <div className="top-map-title">
                      {m.title} <span className="muted">[{m.version}]</span>
                    </div>
                    <div className="history-stats">
                      <b>{t('replay.maps.attempts', { count: m.attempts })}</b>
                      <span>{t('replay.maps.best', { acc: f.num(m.bestAccuracy, 2) })}</span>
                    </div>
                    <div className="history-stats">
                      <span className={m.accuracyChange > 0.05 ? 'good-text' : m.accuracyChange < -0.05 ? 'warn-text' : ''}>
                        {t('stats.accChange', { value: f.signed(m.accuracyChange, 2) })}
                      </span>
                      <span className={m.urChange < -0.5 ? 'good-text' : m.urChange > 0.5 ? 'warn-text' : ''}>
                        {t('stats.urChange', { value: f.signed(m.urChange, 0) })}
                      </span>
                    </div>
                    <button type="button" className="btn small" onClick={() => onOpenMap({ beatmapMd5: m.beatmapMd5, title: m.title, version: m.version })}>
                      {t('replay.progress.show')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DeltaStat({
  label,
  value,
  now,
  before,
  better,
  f,
  digits,
  unit = '',
  periodLabel,
  neutral
}: {
  label: string;
  value: string;
  now: number;
  before: number | undefined;
  better: Better;
  f: Formatters;
  digits: number;
  unit?: string;
  periodLabel: string;
  /** zmiana bez oceny (np. liczba gier) */
  neutral?: boolean;
}) {
  const { t } = useTranslation();
  let hint: string | null = null;
  let tone = '';
  if (before !== undefined && periodLabel) {
    const d = now - before;
    const improvement = better === 'up' ? d : better === 'down' ? -d : Math.abs(before) - Math.abs(now);
    const flat = Math.abs(d) < Math.pow(10, -digits) / 2;
    const verdict = neutral || flat ? '' : improvement > 0 ? t('replay.progress.better') : t('replay.progress.worse');
    tone = neutral || flat ? '' : improvement > 0 ? 'good-text' : 'warn-text';
    hint = `${t('stats.vs', { period: periodLabel })}: ${f.signed(d, digits)}${unit}${verdict ? ` · ${verdict}` : ''}`;
  }
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className={`stat-hint ${tone}`}>{hint}</div>}
    </div>
  );
}

function BpmTable({ rows, f }: { rows: (StatsTotals & { range: string })[]; f: Formatters }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.streamUr ?? 0));
  return (
    <div className="bpm-table" role="table">
      <div className="bpm-row head" role="row">
        <span role="columnheader">BPM</span>
        <span role="columnheader">{t('stats.playsShort')}</span>
        <span role="columnheader">{t('replay.streamUr')}</span>
        <span role="columnheader">K2−K1</span>
        <span role="columnheader">{t('replay.progress.entry')}</span>
        <span role="columnheader">{t('replay.progress.accuracy')}</span>
      </div>
      {rows.map((r) => (
        <div key={r.range} className="bpm-row" role="row">
          <span role="cell">
            <b>{r.range}</b>
          </span>
          <span role="cell">{r.plays}</span>
          <span role="cell" className="bpm-bar-cell">
            <span className="bar">
              <span className="bar-fill" style={{ width: `${((r.streamUr ?? 0) / max) * 100}%` }} />
            </span>
            <span>{r.streamUr === null ? '—' : f.num(r.streamUr)}</span>
          </span>
          <span role="cell">{f.signed(r.k2k1)} ms</span>
          <span role="cell">{r.entry === null ? '—' : `${f.signed(r.entry)} ms`}</span>
          <span role="cell">{f.num(r.accuracy, 2)}%</span>
        </div>
      ))}
    </div>
  );
}
