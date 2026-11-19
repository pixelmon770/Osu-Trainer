import { hitWindows, type DrillResult } from '@osu-trainer/analyzer';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DrillRecord } from '../../../shared/api.ts';
import { HitErrorChart, StreamPositionChart } from '../components/charts.tsx';
import Stat from '../components/Stat.tsx';
import TrendChart from '../components/TrendChart.tsx';
import type { Formatters } from '../format.ts';

export function DrillResults({ r, od, f, children }: { r: DrillResult; od: number; f: Formatters; children?: ReactNode }) {
  const { t } = useTranslation();
  const ms = (v: number) => `${f.signed(v)} ms`;
  const notes = r.notes.map((n) => ({ errorMs: n.errorMs, key: n.tapFinger }));

  // krótkie wnioski – te same progi co w replayach
  const tips: string[] = [];
  if (r.k1.count >= 10 && r.k2.count >= 10 && Math.abs(r.k2k1) >= 4) {
    tips.push(t('drill.tip.keyGap', { later: r.k2k1 > 0 ? 'K2' : 'K1', diff: f.num(Math.abs(r.k2k1), 1) }));
  }
  const pos = r.byPosition.filter((b) => b.errors.count >= 10);
  if (pos.length >= 2 && pos[pos.length - 1]!.errors.mean - pos[0]!.errors.mean >= 8) {
    tips.push(t('drill.tip.drift', { first: f.signed(pos[0]!.errors.mean), last: f.signed(pos[pos.length - 1]!.errors.mean) }));
  }
  if (r.notes.length && r.wrongFinger / r.notes.length >= 0.05) tips.push(t('drill.tip.wrongFinger', { count: r.wrongFinger }));
  if (r.extraTaps >= 5) tips.push(t('drill.tip.extra', { count: r.extraTaps }));
  if (r.entry.count >= 5 && Math.abs(r.entry.mean) >= 8) {
    tips.push(t(r.entry.mean > 0 ? 'replay.insight.entryLate' : 'replay.insight.entryEarly', { value: f.num(Math.abs(r.entry.mean), 1) }));
  }

  return (
    <div className="drill-results">
      {tips.length > 0 && (
        <div className="card insights">
          <h3>{t('replay.insightsTitle')}</h3>
          <ul>
            {tips.map((tip) => (
              <li key={tip} className="warn">
                <span className="insight-mark" aria-hidden>
                  !
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid">
        <Stat label={t('replay.progress.accuracy')} value={`${f.num(r.accuracy, 2)}%`} hint={t('drill.missesExtra', { misses: r.misses, extra: r.extraTaps })} />
        <Stat label="UR" value={f.num(r.errors.ur)} hint={`${t('replay.meanError')}: ${ms(r.errors.mean)}`} />
        <Stat label={t('replay.keyStat', { key: 'K1' })} value={ms(r.k1.mean)} hint={t('replay.keyHint', { ur: f.num(r.k1.ur), count: r.k1.count })} />
        <Stat label={t('replay.keyStat', { key: 'K2' })} value={ms(r.k2.mean)} hint={t('replay.keyHint', { ur: f.num(r.k2.ur), count: r.k2.count })} />
        <Stat label="K2−K1" value={ms(r.k2k1)} hint={t('replay.progress.closerZero')} />
        <Stat label={t('replay.entry')} value={ms(r.entry.mean)} hint={t('drill.entryHint')} />
        <Stat label={t('drill.wrongFinger')} value={f.num(r.wrongFinger)} hint={t('drill.wrongFingerHint')} />
        <Stat label={t('replay.tapSpread')} value={`${f.num(r.tapSpread, 1)} ms`} hint={t('replay.tapSpreadHint')} />
      </div>
      <div className="card chart-card">
        <h3>{t('replay.chart.hitErrors')}</h3>
        <HitErrorChart notes={notes} windows={hitWindows(od)} f={f} />
      </div>
      {r.byPosition.length > 1 && (
        <div className="card chart-card">
          <h3>{t('drill.byPosition')}</h3>
          <StreamPositionChart rows={r.byPosition} f={f} />
        </div>
      )}
      {children}
    </div>
  );
}

/** Wcześniejsze wyniki tego samego ćwiczenia: UR i celność sesja po sesji. */
export function DrillHistory({ kind, name, refresh, f }: { kind: DrillRecord['kind']; name: string; refresh: unknown; f: Formatters }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<DrillRecord[]>([]);
  useEffect(() => {
    void window.api.listDrills(kind, name, 200).then(setList);
  }, [kind, name, refresh]);
  if (list.length === 0) return <p className="muted small">{t('drill.noHistory')}</p>;
  const asc = [...list].reverse();
  const fmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const pts = (pick: (d: DrillRecord) => number) =>
    asc.map((d) => ({ id: d.id, label: fmt.format(new Date(d.createdAt)), tip: `${f.date(d.createdAt)} · ${f.num(d.bpm)} BPM`, value: pick(d) }));
  const best = list.reduce((b, d) => (d.ur < b.ur ? d : b), list[0]!);
  return (
    <div className="drill-history">
      <p className="muted small">
        {t('drill.historySummary', { count: list.length, ur: f.num(best.ur), bpm: f.num(best.bpm), date: f.date(best.createdAt) })}
      </p>
      {list.length >= 2 && (
        <div className="trend-grid">
          <TrendChart title="UR" betterHint={t('replay.progress.lowerBetter')} points={pts((d) => d.ur)} format={(v) => f.num(v)} />
          <TrendChart title="K2−K1" betterHint={t('replay.progress.closerZero')} points={pts((d) => d.k2Mean - d.k1Mean)} format={(v) => `${f.signed(v, 0)} ms`} zeroLine />
          <TrendChart title={t('replay.progress.accuracy')} betterHint={t('replay.progress.higherBetter')} points={pts((d) => d.accuracy)} format={(v) => `${f.num(v, 1)}%`} />
        </div>
      )}
    </div>
  );
}
