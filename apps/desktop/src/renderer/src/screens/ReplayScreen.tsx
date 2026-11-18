import type { ReplayAnalysis } from '@osu-trainer/analyzer';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MapInfo, ReplayResult } from '../../../shared/api.ts';
import { HitErrorChart, StreamPositionChart, TimelineChart } from '../components/charts.tsx';
import Stat from '../components/Stat.tsx';
import { formatTime, makeFormatters, type Formatters } from '../format.ts';
import { useFileDrop } from '../hooks/useFileDrop.ts';
import { buildInsights } from '../insights.ts';

const KNOWN_ERRORS = ['not-osr-file', 'map-not-selected', 'map-mismatch', 'other-mode'];

export default function ReplayScreen() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReplayResult>(null);
  const f = makeFormatters(i18n.language);
  const labels = { pickReplay: t('replay.pick'), pickMapForReplay: t('replay.pickMap') };

  async function run(job: () => Promise<ReplayResult>) {
    setBusy(true);
    try {
      const r = await job();
      if (r) setResult(r);
    } finally {
      setBusy(false);
    }
  }

  const dragging = useFileDrop((paths) => {
    const osr = paths.find((p) => p.toLowerCase().endsWith('.osr'));
    const osu = paths.find((p) => p.toLowerCase().endsWith('.osu')) ?? null;
    void run(() => window.api.analyzeReplayFile(osr ?? paths[0]!, osu, labels));
  });

  return (
    <div className={`screen${dragging ? ' dragging' : ''}`}>
      <header className="screen-head">
        <h1>{t('replay.title')}</h1>
        <p className="muted">{t('replay.subtitle')}</p>
      </header>

      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => window.api.pickAndAnalyzeReplay(labels))}>
          {busy ? t('replay.analyzing') : t('replay.pick')}
        </button>
        <span className="muted small">{t('replay.dropHint')}</span>
      </div>

      {result && !result.ok && (
        <div className="card error">
          {KNOWN_ERRORS.includes(result.error) ? t(`replay.error.${result.error}`) : t('replay.error.generic', { message: result.error })}
        </div>
      )}
      {result?.ok && <Report a={result.analysis} map={result.map} f={f} />}
    </div>
  );
}

function Report({ a, map, f }: { a: ReplayAnalysis; map: MapInfo; f: Formatters }) {
  const { t } = useTranslation();
  const insights = buildInsights(a, map.endMs, t, f);
  const msStat = (mean: number) => `${f.signed(mean)} ms`;
  const lateEarly = (mean: number) => (Math.abs(mean) < 0.5 ? t('replay.onTime') : mean > 0 ? t('replay.late') : t('replay.early'));
  const totalMisses = a.misses.noClick + a.misses.aim + a.misses.early + a.misses.notelock;

  return (
    <div className="report">
      <div className="card map-title">
        <div>
          <div className="map-name">
            {map.artist} – {map.title}
          </div>
          <div className="muted">
            [{map.version}] · {a.player} · {f.date(a.playedAt)}
          </div>
        </div>
        <div className="chips">
          {a.mods.length > 0 && <span className="chip">{a.mods.join(' ')}</span>}
          <span className="chip">{t('replay.accuracy', { value: f.num(a.header.accuracy, 2) })}</span>
          <span className="chip">{t('replay.combo', { value: f.num(a.maxCombo) })}</span>
          <span className="chip">
            300 {a.header.count300} · 100 {a.header.count100} · 50 {a.header.count50} · ✕ {a.header.countMiss}
          </span>
        </div>
      </div>

      <div className="card insights">
        <h3>{t('replay.insightsTitle')}</h3>
        <ul>
          {insights.map((i) => (
            <li key={i.text} className={i.tone}>
              <span className="insight-mark" aria-hidden>
                {i.tone === 'warn' ? '!' : i.tone === 'good' ? '✓' : 'i'}
              </span>
              {i.text}
            </li>
          ))}
        </ul>
      </div>

      <h2>{t('replay.sectionTiming')}</h2>
      <div className="grid">
        <Stat label="UR" value={f.num(a.errors.ur)} hint={t('replay.urHint')} />
        <Stat label={t('replay.meanError')} value={msStat(a.errors.mean)} hint={lateEarly(a.errors.mean)} />
        <Stat label={t('replay.keyStat', { key: 'K1' })} value={msStat(a.keys.K1.mean)} hint={t('replay.keyHint', { ur: f.num(a.keys.K1.ur), count: a.keys.K1.count })} />
        <Stat label={t('replay.keyStat', { key: 'K2' })} value={msStat(a.keys.K2.mean)} hint={t('replay.keyHint', { ur: f.num(a.keys.K2.ur), count: a.keys.K2.count })} />
      </div>
      <div className="card chart-card">
        <h3>{t('replay.chart.hitErrors')}</h3>
        <HitErrorChart notes={a.notes} windows={a.difficulty.windows} f={f} />
      </div>

      <h2>{t('replay.sectionStreams')}</h2>
      <div className="grid">
        <Stat label={t('replay.streamUr')} value={f.num(a.streams.errors.ur)} hint={t('replay.outsideUr', { value: f.num(a.streams.outside.ur) })} />
        <Stat label={t('replay.entry')} value={msStat(a.streams.entry.mean)} hint={t('replay.entryHint')} />
        <Stat label={t('replay.alternation')} value={`${f.num(a.streams.alternation, 1)}%`} hint={t('replay.alternationHint', { count: a.streams.alternationBreaks })} />
        <Stat label={t('replay.tapSpread')} value={`${f.num(a.streams.tapSpread, 1)} ms`} hint={t('replay.tapSpreadHint')} />
      </div>
      <div className="card chart-card">
        <h3>{t('replay.chart.byPosition')}</h3>
        <p className="muted small">{t('replay.chart.byPositionHint')}</p>
        <StreamPositionChart rows={a.streams.byPosition} f={f} />
      </div>

      <h2>{t('replay.sectionAimMisses')}</h2>
      <div className="grid">
        <Stat label={t('replay.aimDistance')} value={`${f.num(a.aim.meanDistance * 100)}%`} hint={t('replay.aimDistanceHint')} />
        <Stat
          label={t('replay.overshoot')}
          value={`${f.signed(a.aim.jumpOvershoot * 100, 0)}%`}
          hint={t('replay.overshootHint', { count: a.aim.jumpCount })}
        />
        <Stat
          label={t('replay.misses')}
          value={f.num(totalMisses)}
          hint={t('replay.missBreakdown', { noClick: a.misses.noClick, aim: a.misses.aim, notelock: a.misses.notelock, early: a.misses.early })}
        />
        <Stat
          label={t('replay.judged')}
          value={`${f.num(a.judged.accuracy, 2)}%`}
          hint={t('replay.judgedHint', { c300: a.judged.count300, c100: a.judged.count100, c50: a.judged.count50, miss: a.judged.countMiss })}
        />
      </div>

      <h2>{t('replay.sectionTimeline')}</h2>
      <div className="card chart-card">
        <h3>{t('replay.chart.timeline')}</h3>
        <p className="muted small">{t('replay.chart.timelineHint')}</p>
        <TimelineChart segments={a.timeline} fatigueAt={a.fatigueAt} f={f} />
      </div>
      <p className="muted small footnote">
        {t('replay.footnote', { replayEnd: formatTime(a.lastFrameMs) })}
      </p>
    </div>
  );
}
