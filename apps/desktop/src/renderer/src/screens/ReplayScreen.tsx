import type { ReplayAnalysis } from '@osu-trainer/analyzer';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MapGroup, MapInfo, ReplayFilter, ReplayResult, ReplaySummary } from '../../../shared/api.ts';
import { HitErrorChart, StreamPositionChart, TimelineChart } from '../components/charts.tsx';
import Stat from '../components/Stat.tsx';
import TrendChart from '../components/TrendChart.tsx';
import { formatTime, makeFormatters, type Formatters } from '../format.ts';
import { useFileDrop } from '../hooks/useFileDrop.ts';
import { buildInsights } from '../insights.ts';

const KNOWN_ERRORS = ['not-osr-file', 'map-not-selected', 'map-mismatch', 'map-not-found', 'other-mode', 'not-found'];
const FILTER_KEY = 'osu-trainer.replayFilter';

interface MapRef {
  beatmapMd5: string;
  title: string;
  version: string;
}

interface Props {
  /** replay do otwarcia (np. z powiadomienia) */
  openId: string | null;
  onOpened: () => void;
  /** mapa do pokazania postępu (np. ze Statystyk) */
  openMap?: MapRef | null;
  onMapOpened?: () => void;
  /** ostatnio dodany replay – odświeża listę */
  latest: ReplaySummary | null;
}

function loadFilter(): ReplayFilter & { map?: MapRef | null } {
  try {
    return JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export default function ReplayScreen({ openId, onOpened, openMap, onMapOpened, latest }: Props) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const labels = { pickReplay: t('replay.pick'), pickMapForReplay: t('replay.pickMap') };

  const saved = loadFilter();
  const [filter, setFilter] = useState<ReplayFilter>({
    search: saved.search ?? '',
    source: saved.source ?? 'all',
    sinceDays: saved.sinceDays ?? null,
    mods: saved.mods ?? null,
    hidePartial: saved.hidePartial ?? false,
    sort: saved.sort ?? 'newest'
  });
  const [map, setMap] = useState<MapRef | null>(openMap ?? saved.map ?? null);
  useEffect(() => {
    if (openMap) {
      setMap(openMap);
      onMapOpened?.();
    }
  }, [openMap, onMapOpened]);
  const [view, setView] = useState<'plays' | 'maps'>('plays');
  const [list, setList] = useState<{ items: ReplaySummary[]; total: number } | null>(null);
  const [maps, setMaps] = useState<MapGroup[] | null>(null);
  const [progress, setProgress] = useState<ReplaySummary[]>([]);
  const [modOptions, setModOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReplayResult>(null);

  // filtr zapamiętany lokalnie (wygoda, nie dane)
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ ...filter, map }));
    } catch {
      // brak pamięci przeglądarki – trudno
    }
  }, [filter, map]);

  const refresh = useCallback(async () => {
    const fl: ReplayFilter = { ...filter, beatmapMd5: map?.beatmapMd5 ?? null };
    const [plays, groups, mods, prog] = await Promise.all([
      window.api.queryReplays({ ...fl, limit: 500 }),
      window.api.listMaps(fl),
      window.api.modCombos(),
      map ? window.api.queryReplays({ ...fl, sort: 'oldest', limit: 1000 }) : Promise.resolve({ items: [], total: 0 })
    ]);
    setList(plays);
    setMaps(groups);
    setModOptions(mods);
    setProgress(prog.items);
    return plays.items;
  }, [filter, map]);

  const open = useCallback(async (id: string) => {
    setSelected(id);
    setResult(await window.api.getReplay(id));
  }, []);

  // pierwsze wejście: otwórz najnowszy (chyba że powiadomienie wskazało konkretny – niżej)
  const [initialOpenId] = useState(openId);
  const [first, setFirst] = useState(true);
  useEffect(() => {
    // odświeżanie po zmianie filtra; przy pierwszym wejściu otwieramy górny replay
    const timer = setTimeout(() => {
      void refresh().then((items) => {
        if (first) {
          setFirst(false);
          if (!initialOpenId && items[0]) void open(items[0].id);
        }
      });
    }, 150); // krótka zwłoka, żeby wpisywanie w wyszukiwarkę nie pytało bazy po każdej literze
    return () => clearTimeout(timer);
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps -- first/open celowo poza zależnościami

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

  const chooseMap = (m: MapRef | null) => {
    setMap(m);
    setView('plays');
  };

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
        <aside className="card history">
          <Filters
            filter={filter}
            onChange={(patch) => setFilter((old) => ({ ...old, ...patch }))}
            view={view}
            onView={setView}
            modOptions={modOptions}
            map={map}
            onClearMap={() => chooseMap(null)}
            total={view === 'plays' ? list?.total : maps?.length}
          />
          {view === 'plays' ? (
            <PlayList items={list?.items ?? null} total={list?.total ?? 0} selected={selected} onSelect={(id) => void open(id)} f={f} />
          ) : (
            <MapList
              maps={maps}
              f={f}
              onSelect={(m) => chooseMap({ beatmapMd5: m.beatmapMd5, title: m.title, version: m.version })}
            />
          )}
        </aside>

        <div className="replay-main">
          {map && progress.length > 0 && (
            <ProgressPanel map={map} attempts={progress} selected={selected} onSelect={(id) => void open(id)} f={f} />
          )}
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
              onShowProgress={
                map?.beatmapMd5 === result.beatmapMd5
                  ? undefined
                  : () => chooseMap({ beatmapMd5: result.beatmapMd5, title: result.map.title, version: result.map.version })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- filtry ----------

function Filters({
  filter,
  onChange,
  view,
  onView,
  modOptions,
  map,
  onClearMap,
  total
}: {
  filter: ReplayFilter;
  onChange: (patch: Partial<ReplayFilter>) => void;
  view: 'plays' | 'maps';
  onView: (v: 'plays' | 'maps') => void;
  modOptions: string[];
  map: MapRef | null;
  onClearMap: () => void;
  total: number | undefined;
}) {
  const { t } = useTranslation();
  const active =
    !!filter.search || filter.source !== 'all' || !!filter.sinceDays || !!filter.mods || !!filter.hidePartial || filter.sort !== 'newest';
  return (
    <div className="filters">
      <div className="history-head">
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'plays'} className={view === 'plays' ? 'on' : ''} onClick={() => onView('plays')}>
            {t('replay.filter.plays')}
          </button>
          <button type="button" role="tab" aria-selected={view === 'maps'} className={view === 'maps' ? 'on' : ''} onClick={() => onView('maps')}>
            {t('replay.filter.maps')}
          </button>
        </div>
        {total !== undefined && <span className="muted small">{total}</span>}
      </div>
      <input
        type="search"
        className="search"
        placeholder={t('replay.filter.search')}
        value={filter.search ?? ''}
        onChange={(e) => onChange({ search: e.target.value })}
      />
      <div className="filter-grid">
        <select value={filter.sinceDays ?? ''} onChange={(e) => onChange({ sinceDays: e.target.value ? Number(e.target.value) : null })} aria-label={t('replay.filter.period')}>
          <option value="">{t('replay.filter.allTime')}</option>
          <option value="1">{t('replay.filter.today')}</option>
          <option value="7">{t('replay.filter.days', { count: 7 })}</option>
          <option value="30">{t('replay.filter.days', { count: 30 })}</option>
          <option value="90">{t('replay.filter.days', { count: 90 })}</option>
        </select>
        <select value={filter.mods ?? ''} onChange={(e) => onChange({ mods: e.target.value || null })} aria-label={t('replay.filter.mods')}>
          <option value="">{t('replay.filter.anyMods')}</option>
          {modOptions.map((m) => (
            <option key={m} value={m}>
              {m === 'NM' ? t('replay.filter.noMods') : m.split(',').join('')}
            </option>
          ))}
        </select>
        <select value={filter.source ?? 'all'} onChange={(e) => onChange({ source: e.target.value as ReplayFilter['source'] })} aria-label={t('replay.filter.source')}>
          <option value="all">{t('replay.filter.anyClient')}</option>
          <option value="stable">stable</option>
          <option value="lazer">lazer</option>
          <option value="file">{t('replay.filter.manual')}</option>
        </select>
        <select value={filter.sort ?? 'newest'} onChange={(e) => onChange({ sort: e.target.value as ReplayFilter['sort'] })} aria-label={t('replay.filter.sort')}>
          <option value="newest">{t('replay.filter.newest')}</option>
          <option value="oldest">{t('replay.filter.oldest')}</option>
          <option value="accuracy">{t('replay.filter.bestAcc')}</option>
          <option value="ur">{t('replay.filter.bestUr')}</option>
        </select>
      </div>
      <label className="check">
        <input type="checkbox" checked={!!filter.hidePartial} onChange={(e) => onChange({ hidePartial: e.target.checked })} />
        {t('replay.filter.hidePartial')}
      </label>
      {(map || active) && (
        <div className="chips">
          {map && (
            <span className="chip removable" title={`${map.title} [${map.version}]`}>
              <span className="chip-text">
                {map.title} <span className="muted">[{map.version}]</span>
              </span>
              <button type="button" className="icon-btn" aria-label={t('replay.filter.clearMap')} onClick={onClearMap}>
                ×
              </button>
            </span>
          )}
          {active && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onChange({ search: '', source: 'all', sinceDays: null, mods: null, hidePartial: false, sort: 'newest' })}
            >
              {t('replay.filter.reset')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- listy ----------

function PlayList({
  items,
  total,
  selected,
  onSelect,
  f
}: {
  items: ReplaySummary[] | null;
  total: number;
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
    setImporting(
      p.total === 0
        ? t('replay.history.importNothing', { folders: p.folders.map((x) => x.path).join(', ') || '—' })
        : t('replay.history.importDone', { imported: p.imported, skipped: p.skipped + p.failed })
    );
  }

  return (
    <>
      {items && items.length === 0 && (
        <div className="history-empty">
          <p className="muted small">{total === 0 ? t('replay.history.emptyFiltered') : t('replay.history.empty')}</p>
          <button type="button" className="btn small" onClick={() => void importRecent()}>
            {t('replay.history.import')}
          </button>
        </div>
      )}
      {importing && <p className="muted small history-note">{importing}</p>}
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
                {s.source === 'lazer' && <span className="tag dim">lazer</span>}
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
    </>
  );
}

function MapList({ maps, onSelect, f }: { maps: MapGroup[] | null; onSelect: (m: MapGroup) => void; f: Formatters }) {
  const { t } = useTranslation();
  if (maps && maps.length === 0) return <p className="muted small history-note">{t('replay.history.emptyFiltered')}</p>;
  return (
    <ul className="history-list">
      {maps?.map((m) => (
        <li key={m.beatmapMd5}>
          <button type="button" className="history-item" onClick={() => onSelect(m)}>
            <span className="history-title">
              {m.title} <span className="muted">[{m.version}]</span>
            </span>
            <span className="history-meta">
              <span>{m.artist}</span>
              <span>{t('replay.maps.last', { date: f.date(m.lastPlayed) })}</span>
            </span>
            <span className="history-stats">
              <b>{t('replay.maps.attempts', { count: m.attempts })}</b>
              <span>{t('replay.maps.best', { acc: f.num(m.bestAccuracy, 2) })}</span>
              <span>{t('replay.maps.bestUr', { ur: f.num(m.bestUr) })}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------- postęp na mapie ----------

function ProgressPanel({
  map,
  attempts,
  selected,
  onSelect,
  f
}: {
  map: MapRef;
  attempts: ReplaySummary[];
  selected: string | null;
  onSelect: (id: string) => void;
  f: Formatters;
}) {
  const { t, i18n } = useTranslation();
  const short = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const pts = (pick: (s: ReplaySummary) => number) => attempts.map((s) => ({ id: s.id, label: short.format(new Date(s.playedAt)), value: pick(s) }));

  // porównanie pierwszych i ostatnich prób (po ~5, ale nie więcej niż połowa)
  const n = Math.min(5, Math.floor(attempts.length / 2));
  const avg = (list: ReplaySummary[], pick: (s: ReplaySummary) => number) => list.reduce((s, x) => s + pick(x), 0) / list.length;
  const firstN = attempts.slice(0, n);
  const lastN = attempts.slice(-n);
  const delta = (pick: (s: ReplaySummary) => number) => avg(lastN, pick) - avg(firstN, pick);
  const rows =
    n >= 2
      ? [
          { label: t('replay.progress.accuracy'), d: delta((s) => s.accuracy), unit: ' pp', better: 1, digits: 2 },
          { label: 'UR', d: delta((s) => s.ur), unit: '', better: -1, digits: 0 },
          { label: 'K2−K1', d: delta((s) => Math.abs(s.k2Mean - s.k1Mean)), unit: ' ms', better: -1, digits: 1 },
          { label: t('replay.progress.entry'), d: delta((s) => Math.abs(s.entryMean)), unit: ' ms', better: -1, digits: 1 }
        ]
      : [];

  return (
    <section className="card progress-panel">
      <div className="progress-head">
        <div>
          <h3>{t('replay.progress.title')}</h3>
          <div className="muted">
            {map.title} [{map.version}] · {t('replay.maps.attempts', { count: attempts.length })}
          </div>
        </div>
        {rows.length > 0 && (
          <div>
          <div className="muted small">{t('replay.progress.compare', { n })}</div>
          <ul className="deltas">
            {rows.map((r) => {
              const good = Math.sign(r.d) === r.better;
              const flat = Math.abs(r.d) < Math.pow(10, -r.digits);
              return (
                <li key={r.label} className={flat ? '' : good ? 'up' : 'down'}>
                  <span>{r.label}</span>
                  <b>
                    {f.signed(r.d, r.digits)}
                    {r.unit}
                  </b>
                  <span className="muted small">{flat ? t('replay.progress.same') : good ? t('replay.progress.better') : t('replay.progress.worse')}</span>
                </li>
              );
            })}
          </ul>
          </div>
        )}
      </div>
      {attempts.length < 2 ? (
        <p className="muted small">{t('replay.progress.needMore')}</p>
      ) : (
        <div className="trend-grid">
          <TrendChart
            title={t('replay.progress.accuracy')}
            betterHint={t('replay.progress.higherBetter')}
            points={pts((s) => s.accuracy)}
            format={(v) => `${f.num(v, 1)}%`}
            selectedId={selected}
            onSelect={onSelect}
          />
          <TrendChart
            title="UR"
            betterHint={t('replay.progress.lowerBetter')}
            points={pts((s) => s.ur)}
            format={(v) => f.num(v)}
            selectedId={selected}
            onSelect={onSelect}
          />
          <TrendChart
            title="K2−K1"
            betterHint={t('replay.progress.closerZero')}
            points={pts((s) => s.k2Mean - s.k1Mean)}
            format={(v) => `${f.signed(v, 0)} ms`}
            selectedId={selected}
            onSelect={onSelect}
            zeroLine
          />
        </div>
      )}
      <p className="muted small">{t('replay.progress.hint')}</p>
    </section>
  );
}

function Report({
  a,
  map,
  f,
  onOpenInOsu,
  onDelete,
  onShowProgress
}: {
  a: ReplayAnalysis;
  map: MapInfo;
  f: Formatters;
  onOpenInOsu: () => void;
  onDelete: () => void;
  onShowProgress?: () => void;
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
          {onShowProgress && (
            <button type="button" className="btn small" onClick={onShowProgress}>
              {t('replay.progress.show')}
            </button>
          )}
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
        <h3>{t('replay.chart.timeline', { seconds: Math.round((a.segmentMs ?? 20000) / 1000) })}</h3>
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
