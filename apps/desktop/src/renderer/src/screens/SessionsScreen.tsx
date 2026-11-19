import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from '../../../shared/api.ts';
import TrendChart from '../components/TrendChart.tsx';
import { makeFormatters } from '../format.ts';
import { SessionCard } from './Dashboard.tsx';

export default function SessionsScreen({ onOpenReplay }: { onOpenReplay: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const [days, setDays] = useState<number | null>(30);
  const [list, setList] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    void window.api.sessions(days).then(setList);
  }, [days]);

  const withPlays = (list ?? []).filter((s) => s.plays > 0 && s.ur !== null).reverse();
  const short = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const pts = (pick: (s: SessionSummary) => number | null) =>
    withPlays
      .filter((s) => pick(s) !== null)
      .map((s) => ({ id: s.id, label: short.format(new Date(s.start)), tip: `${f.date(s.start)} · ${t('stats.plays', { count: s.plays })}`, value: pick(s)! }));

  // ile sesji kończy się gorzej niż środek – czy sesje nie są za długie
  const longOnes = (list ?? []).filter((s) => s.fatigue);
  const tired = longOnes.filter((s) => s.fatigue!.endUr > s.fatigue!.middleUr * 1.1).length;
  const slowStart = (list ?? []).filter((s) => s.warmup && s.warmup.firstUr > s.warmup.restUr * 1.05).length;
  const withWarmup = (list ?? []).filter((s) => s.warmup).length;

  return (
    <div className="screen sessions">
      <header className="screen-head">
        <h1>{t('sessions.title')}</h1>
        <p className="muted">{t('sessions.subtitle')}</p>
      </header>
      <div className="stats-filters">
        <div className="segmented" role="tablist">
          {[7, 30, 90, null].map((d) => (
            <button key={String(d)} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
              {d ? t('stats.days', { count: d }) : t('replay.filter.allTime')}
            </button>
          ))}
        </div>
      </div>

      {list && list.length === 0 && <p className="muted">{t('stats.empty')}</p>}

      {(longOnes.length > 0 || withWarmup > 0) && (
        <div className="card insights">
          <h3>{t('replay.insightsTitle')}</h3>
          <ul>
            {longOnes.length > 0 && (
              <li className={tired / longOnes.length >= 0.5 ? 'warn' : 'good'}>
                <span className="insight-mark" aria-hidden>
                  {tired / longOnes.length >= 0.5 ? '!' : '✓'}
                </span>
                {t('sessions.fatigueSummary', { tired, total: longOnes.length })}
              </li>
            )}
            {withWarmup > 0 && (
              <li className={slowStart / withWarmup >= 0.5 ? 'warn' : 'good'}>
                <span className="insight-mark" aria-hidden>
                  {slowStart / withWarmup >= 0.5 ? '!' : '✓'}
                </span>
                {t('sessions.warmupSummary', { slow: slowStart, total: withWarmup })}
              </li>
            )}
          </ul>
        </div>
      )}

      {withPlays.length >= 2 && (
        <>
          <h2>{t('sessions.trend')}</h2>
          <div className="trend-grid">
            <TrendChart title="UR" betterHint={t('replay.progress.lowerBetter')} points={pts((s) => s.ur)} format={(v) => f.num(v)} />
            <TrendChart title="K2−K1" betterHint={t('replay.progress.closerZero')} points={pts((s) => s.k2k1)} format={(v) => `${f.signed(v, 0)} ms`} zeroLine />
            <TrendChart title={t('sessions.length')} points={pts((s) => s.durationMs / 60000)} format={(v) => `${f.num(v)} min`} />
          </div>
        </>
      )}

      <h2>{t('sessions.list')}</h2>
      <div className="session-grid">
        {list?.map((s) => (
          <SessionCard key={s.id} s={s} f={f} onOpenReplay={onOpenReplay} />
        ))}
      </div>
    </div>
  );
}
