import type { ReplayAnalysis } from '@osu-trainer/analyzer';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MapInfo, ReplayResult, ReplaySummary } from '../../../shared/api.ts';
import { HitErrorChart, StreamPositionChart, TimelineChart } from '../components/charts.tsx';
import Stat from '../components/Stat.tsx';
import { formatTime, makeFormatters, type Formatters } from '../format.ts';
import { useFileDrop } from '../hooks/useFileDrop.ts';
import { buildInsights } from '../insights.ts';

const KNOWN_ERRORS = ['not-osr-file', 'map-not-selected', 'map-mismatch', 'map-not-found', 'other-mode', 'not-found'];

interface Props {
  /** replay do otwarcia (np. z powiadomienia) */
  openId: string | null;
  onOpened: () => void;
  /** ostatnio dodany replay – odświeża listę */
  latest: ReplaySummary | null;
}

export default function ReplayScreen({ openId, onOpened, latest }: Props) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<ReplaySummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReplayResult>(null);
  const f = makeFormatters(i18n.language);
  const labels = { pickReplay: t('replay.pick'), pickMapForReplay: t('replay.pickMap') };

  const refresh = useCallback(async () => {
    const items = await window.api.listReplays(300);
    setList(items);
    return items;
  }, []);

  const open = useCallback(async (id: string) => {
    setSelected(id);
    setResult(await window.api.getReplay(id));
  }, []);

  // pierwsze wejście: lista + najnowszy replay (chyba że powiadomienie wskazało konkretny – niżej)
  const [initialOpenId] = useState(openId);
  useEffect(() => {
    void refresh().then((items) => {
      if (!initialOpenId && items[0]) void open(items[0].id);
    });
  }, [refresh, open, initialOpenId]);

  // nowy replay w tle: odśwież listę (nie przełączamy widoku, żeby nie przerywać czytania)
  useEffect(() => {
    if (latest) void refresh();
  }, [latest, refresh]);

  useEffect(() => {
    if (openId) {
      void open(openId);
      onOpened();
    }
  }, [openId, open, onOpened]);

  async function run(job: () => Promise<ReplayResult>) {
    setBusy(true);
    try {
      const r = await job();
      if (!r) return;
      setResult(r);
      if (r.ok) {
        setSelected(r.id);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const dragging = useFileDrop((paths) => {
    const osr = paths.find((p) => p.toLowerCase().endsWith('.osr'));
    const osu = paths.find((p) => p.toLowerCase().endsWith('.osu')) ?? null;
    void run(() => window.api.analyzeReplayFile(osr ?? paths[0]!, osu, labels));
  });

  async function remove(id: string) {
    await window.api.deleteReplay(id);
    const items = await refresh();
    if (selected === id) {
      const next = items[0]?.id;
      if (next) void open(next);
      else {
        setSelected(null);
        setResult(null);
      }
    }
  }

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

      <div className="replay-layout">
        <HistoryList items={list} selected={selected} onSelect={(id) => void open(id)} f={f} />
        <div className="replay-main">
          {result && !result.ok && (
            <div className="card error">
              {KNOWN_ERRORS.includes(result.error) ? t(`replay.error.${result.error}`) : t('replay.error.generic', { message: result.error })}
            </div>
          )}
          {result?.ok && (
            <Report
              key={result.id}
              a={result.analysis}
              map={result.map}
              f={f}
              onOpenInOsu={() => void window.api.openPath(result.replayFile)}
              onDelete={() => void remove(result.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryList({
  items,
  selected,
  onSelect,
  f
}: {
  items: ReplaySummary[] | null;
  selected: string | null;
  onSelect: (id: string) => void;
  f: Formatters;
}) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState<string | null>(null);

  async function importRecent() {
    setImporting(t('replay.history.importing'));
    const off = window.api.onImportProgress((p) => setImporting(t('replay.history.importProgress', { done: p.done, total: p.total })));
    const p = await window.api.importReplays(30, 100);
    off();
    setImporting(t('replay.history.importDone', { imported: p.imported, skipped: p.skipped + p.failed }));
  }

  return (
    <aside className="card history">
      <div className="history-head">
        <h3>{t('replay.history.title')}</h3>
        {items && <span className="muted small">{items.length}</span>}
      </div>
      {items && items.length === 0 && (
        <div className="history-empty">
          <p className="muted small">{t('replay.history.empty')}</p>
          <button type="button" className="btn small" onClick={() => void importRecent()}>
            {t('replay.history.import')}
          </button>
        </div>
      )}
      {importing && <p className="muted small">{importing}</p>}
      <ul className="history-list">
        {items?.map((s) => (
          <li key={s.id}>
            <button type="button" className={`history-item${s.id === selected ? ' active' : ''}`} onClick={() => onSelect(s.id)}>
              <span className="history-title">
                {s.title} <span className="muted">[{s.version}]</span>
              </span>
              <span className="history-meta">
                <span>{f.date(s.playedAt)}</span>
                {s.mods.length > 0 && <span className="tag">{s.mods.join('')}</span>}
                {s.partial && <span className="tag dim">{t('replay.history.partial')}</span>}
              </span>
              <span className="history-stats">
                <b>{f.num(s.accuracy, 2)}%</b>
                <span>UR {f.num(s.ur)}</span>
                <span>K2−K1 {f.signed(s.k2Mean - s.k1Mean)}</span>
                <span>✕ {s.countMiss}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Report({
  a,
  map,
  f,
  onOpenInOsu,
  onDelete
}: {
  a: ReplayAnalysis;
  map: MapInfo;
  f: Formatters;
  onOpenInOsu: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const insights = buildInsights(a, map.endMs, t, f);
  const msStat = (mean: number) => `${f.signed(mean)} ms`;
  const lateEarly = (mean: number) => (Math.abs(mean) < 0.5 ? t('replay.onTime') : mean > 0 ? t('replay.late') : t('replay.early'));
  const totalMisses = a.misses.noClick + a.misses.aim + a.misses.early + a.misses.notelock;

  return (
    <div className="report replay-report">
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
      <div className="row footnote">
        <button type="button" className="btn small" onClick={onOpenInOsu}>
          {t('replay.openInOsu')}
        </button>
        <button type="button" className="btn small ghost" onClick={onDelete}>
          {t('replay.delete')}
        </button>
        <span className="muted small">{t('replay.footnote', { replayEnd: formatTime(a.lastFrameMs) })}</span>
      </div>
    </div>
  );
}
