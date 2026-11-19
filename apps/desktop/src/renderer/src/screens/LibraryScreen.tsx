// Biblioteka map (SPEC 3.3): mapy, które masz w osu!stable i lazerze, z analizą streamów, skoków i czytania.
// Filtry po parametrach, dobór „pod Twój poziom” i drabinka do mapy-celu.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LadderResult, LibraryMap, LibraryQuery, LibraryStatus, PlayerProfile, Range } from '../../../shared/api.ts';
import { formatTime, makeFormatters } from '../format.ts';
import type { OpenMap } from './StatsScreen.tsx';

const STORAGE_KEY = 'osu-trainer.library';
const PAGE = 100;

type RangeKey =
  | 'stars'
  | 'bpm'
  | 'streamBpm'
  | 'lengthS'
  | 'ar'
  | 'od'
  | 'cs'
  | 'longestBlockS'
  | 'longestStream'
  | 'streamSpacing'
  | 'streamPct'
  | 'jumpsPerMin'
  | 'jumpDistance'
  | 'overlapPct';

/** pola filtrów: klucz, krok pola liczbowego; pierwsze 6 widać zawsze, reszta po „więcej filtrów” */
const RANGES: { key: RangeKey; step: number }[] = [
  { key: 'stars', step: 0.1 },
  { key: 'streamBpm', step: 5 },
  { key: 'longestBlockS', step: 5 },
  { key: 'ar', step: 0.1 },
  { key: 'jumpsPerMin', step: 1 },
  { key: 'lengthS', step: 15 },
  { key: 'bpm', step: 5 },
  { key: 'od', step: 0.1 },
  { key: 'cs', step: 0.1 },
  { key: 'longestStream', step: 4 },
  { key: 'streamSpacing', step: 0.1 },
  { key: 'streamPct', step: 5 },
  { key: 'jumpDistance', step: 0.1 },
  { key: 'overlapPct', step: 5 }
];

type Preset = 'speed' | 'stamina' | 'jumps' | 'reading' | 'accuracy';
const PRESETS: Preset[] = ['speed', 'stamina', 'jumps', 'reading', 'accuracy'];

function loadQuery(): LibraryQuery {
  try {
    const q = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as LibraryQuery;
    return { sort: 'title', ...q, offset: 0, limit: PAGE };
  } catch {
    return { sort: 'title', limit: PAGE };
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Filtry dla przycisków „dobierz do celu” – liczone z Twojego poziomu (albo rozsądnych wartości startowych). */
export function presetQuery(p: Preset, prof: PlayerProfile): { q: Partial<LibraryQuery>; vars: Record<string, number> } {
  const bpm = prof.streamBpm ?? 180;
  const block = prof.blockS ?? 20;
  const stars = prof.stars ?? 5;
  const ar = prof.ar ?? 9;
  const dist = prof.jumpDistance ?? 2;
  switch (p) {
    case 'speed':
      return { q: { streamBpm: [bpm + 5, bpm + 15], longestBlockS: [null, r1(block)], sort: 'streamBpm', desc: false }, vars: { bpm, from: bpm + 5, to: bpm + 15, block: r1(block) } };
    case 'stamina':
      return { q: { streamBpm: [bpm - 15, bpm], longestBlockS: [r1(block * 1.3), r1(block * 2.2)], sort: 'block', desc: false }, vars: { bpm, from: bpm - 15, to: bpm, block: r1(block), min: r1(block * 1.3), max: r1(block * 2.2) } };
    case 'jumps':
      return { q: { jumpDistance: [r1(dist + 0.1), r1(dist + 0.6)], jumpsPerMin: [10, null], streamPct: [null, 20], sort: 'jumps', desc: false }, vars: { dist, from: r1(dist + 0.1), to: r1(dist + 0.6) } };
    case 'reading': {
      const lo = Math.min(r1(ar + 0.3), 10);
      return { q: { ar: [lo, Math.min(r1(ar + 1), 11)], stars: [null, r1(stars + 0.3)], sort: 'stars', desc: false }, vars: { ar, from: lo, stars: r1(stars + 0.3) } };
    }
    case 'accuracy':
      return { q: { stars: [r1(stars - 1.2), r1(stars - 0.3)], od: [8, null], sort: 'stars', desc: true }, vars: { stars, from: r1(stars - 1.2), to: r1(stars - 0.3) } };
  }
}

const CLEAR: Partial<LibraryQuery> = Object.fromEntries(RANGES.map((r) => [r.key, undefined]));

function RangeField({ label, value, step, onChange }: { label: string; value: Range | undefined; step: number; onChange: (r: Range | undefined) => void }) {
  const { t } = useTranslation();
  const [lo, hi] = value ?? [null, null];
  const set = (i: 0 | 1, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    const next: Range = i === 0 ? [v, hi] : [lo, v];
    onChange(next[0] === null && next[1] === null ? undefined : next);
  };
  return (
    <div className="lib-range">
      <span>{label}</span>
      <div className="lib-range-inputs">
        <input type="number" step={step} placeholder={t('library.min')} value={lo ?? ''} onChange={(e) => set(0, e.target.value)} />
        <span aria-hidden>–</span>
        <input type="number" step={step} placeholder={t('library.max')} value={hi ?? ''} onChange={(e) => set(1, e.target.value)} />
      </div>
    </div>
  );
}

interface Props {
  onAnalyze: (md5: string) => void;
  onTrain: (md5: string) => void;
  onOpenPlays: (m: OpenMap) => void;
}

export default function LibraryScreen({ onAnalyze, onTrain, onOpenPlays }: Props) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const [q, setQ] = useState<LibraryQuery>(loadQuery);
  const [data, setData] = useState<{ items: LibraryMap[]; total: number } | null>(null);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [ladder, setLadder] = useState<LadderResult | null>(null);
  const [ladderSteps, setLadderSteps] = useState(4);
  const ladderRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<LibraryQuery>, keepPreset = false) => {
    if (!keepPreset) setPreset(null);
    setQ((old) => ({ ...old, ...patch, offset: 0, limit: PAGE }));
  };

  // wyniki: chwilę po ostatniej zmianie filtrów
  const load = useCallback(async (query: LibraryQuery) => {
    setData(await window.api.queryLibrary(query));
  }, []);
  useEffect(() => {
    try {
      const { offset: _o, limit: _l, ...keep } = q;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
    } catch {
      // bez zapamiętywania filtrów
    }
    const id = setTimeout(() => void load(q), 200);
    return () => clearTimeout(id);
  }, [q, load]);

  // stan indeksowania: często w trakcie, rzadko poza nim
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let wasRunning = false;
    const tick = async () => {
      const s = await window.api.libraryStatus();
      if (!alive) return;
      setStatus(s);
      if (wasRunning && !s.running) {
        void load(q);
        void window.api.playerProfile().then(setProfile);
      }
      wasRunning = s.running;
      timer = setTimeout(() => void tick(), s.running ? 1000 : 10000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // q celowo poza zależnościami – odświeżenie po indeksowaniu bierze filtry z chwili startu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void window.api.playerProfile().then(setProfile);
  }, []);

  const applyPreset = (p: Preset) => {
    if (!profile) return;
    setPreset(p);
    update({ ...CLEAR, ...presetQuery(p, profile).q }, true);
  };

  const showLadder = async (md5: string, steps = ladderSteps) => {
    setLadder(await window.api.mapLadder(md5, steps));
    setTimeout(() => ladderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const sortBy = (key: NonNullable<LibraryQuery['sort']>) =>
    update({ sort: key, desc: q.sort === key ? !q.desc : key !== 'title' }, true);

  const fmtNum = (v: number | null, d = 0) => (v === null ? '–' : f.num(v, d));
  // liczby w opisie celu w formacie języka (18,8 zamiast 18.8)
  const presetVars = useMemo(() => {
    if (!preset || !profile) return null;
    const vars = presetQuery(preset, profile).vars;
    return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, f.num(v, Number.isInteger(v) ? 0 : Number.isInteger(v * 10) ? 1 : 2)]));
    // f zmienia się tylko z językiem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, profile, i18n.language]);
  const activeFilters = RANGES.filter((r) => q[r.key]).length + (q.search ? 1 : 0) + (q.source ? 1 : 0) + (q.played && q.played !== 'any' ? 1 : 0);

  const col = (key: NonNullable<LibraryQuery['sort']> | null, label: string, className = 'num') => (
    <th className={className}>
      {key ? (
        <button type="button" className={`lib-sort${q.sort === key ? ' on' : ''}`} onClick={() => sortBy(key)}>
          {label}
          {q.sort === key ? (q.desc ? ' ↓' : ' ↑') : ''}
        </button>
      ) : (
        label
      )}
    </th>
  );

  const metrics = (m: LibraryMap, basis: LadderResult['basis']) => {
    const parts: string[] = [];
    if (basis === 'streams') parts.push(t('library.m.streamBpm', { value: fmtNum(m.streamBpm) }), t('library.m.block', { value: f.num(m.longestBlockMs / 1000, 1) }));
    if (basis === 'jumps') parts.push(t('library.m.jumpDistance', { value: f.num(m.jumpDistance, 2) }), t('library.m.jumpsPerMin', { value: f.num(m.jumpsPerMin, 1) }), `AR ${f.num(m.ar, 1)}`);
    if (basis === 'general') parts.push(`AR ${f.num(m.ar, 1)}`, `${f.num(m.bpm)} BPM`);
    parts.push(m.stars === null ? '★ –' : `★ ${f.num(m.stars, 2)}`);
    return parts.join(' · ');
  };

  const empty = status && !status.running && status.maps === 0;

  return (
    <div className="screen library">
      <header className="screen-head">
        <h1>{t('library.title')}</h1>
        <p className="muted">{t('library.subtitle')}</p>
      </header>

      <div className="row lib-status">
        {status?.running ? (
          <>
            <span className="pill">{t('library.indexing', { done: status.done, total: status.total })}</span>
            <progress max={Math.max(status.total, 1)} value={status.done} />
          </>
        ) : (
          <span className="muted">{status ? t('library.count', { count: status.maps }) : ''}</span>
        )}
        <button type="button" className="btn small" disabled={status?.running} onClick={() => void window.api.reindexLibrary().then(() => window.api.libraryStatus().then(setStatus))}>
          {t('library.refresh')}
        </button>
        <span className="muted small">{t('library.refreshHint')}</span>
      </div>

      {empty ? (
        <div className="card soon-card">
          <strong>{t('library.emptyTitle')}</strong>
          <p className="muted">{t('library.empty')}</p>
        </div>
      ) : (
        <>
          <section className="card lib-profile">
            <div className="lib-profile-head">
              <h2>{t('library.profile.title')}</h2>
              <span className="muted small">{t('library.profile.hint')}</span>
            </div>
            {profile && profile.plays > 0 ? (
              <div className="lib-profile-stats">
                <div>
                  <span className="muted small">{t('library.profile.streamBpm')}</span>
                  <strong>{profile.streamBpm === null ? '–' : `${f.num(profile.streamBpm)} BPM`}</strong>
                </div>
                <div>
                  <span className="muted small">{t('library.profile.block')}</span>
                  <strong>{profile.blockS === null ? '–' : `${f.num(profile.blockS, 1)} s`}</strong>
                </div>
                <div>
                  <span className="muted small">{t('library.profile.stars')}</span>
                  <strong>{profile.stars === null ? '–' : `★ ${f.num(profile.stars, 2)}`}</strong>
                </div>
                <div>
                  <span className="muted small">AR</span>
                  <strong>{profile.ar === null ? '–' : f.num(profile.ar, 1)}</strong>
                </div>
                <div>
                  <span className="muted small">{t('library.profile.jumps')}</span>
                  <strong>{profile.jumpDistance === null ? '–' : t('library.diameters', { value: f.num(profile.jumpDistance, 2) })}</strong>
                </div>
              </div>
            ) : (
              <p className="muted small">{t('library.profile.none')}</p>
            )}
            <div className="lib-presets">
              <span className="muted small">{t('library.preset.title')}</span>
              <div className="chips">
                {PRESETS.map((p) => (
                  <button key={p} type="button" className={`chip lib-chip${preset === p ? ' on' : ''}`} disabled={!profile} onClick={() => applyPreset(p)}>
                    {t(`library.preset.${p}`)}
                  </button>
                ))}
              </div>
              {preset && presetVars && <p className="small lib-preset-why">{t(`library.preset.${preset}Why`, presetVars)}</p>}
            </div>
          </section>

          {ladder && (
            <section className="card lib-ladder" ref={ladderRef}>
              <div className="lib-ladder-head">
                <h2>{ladder.target ? t('library.ladder.title', { map: `${ladder.target.title} [${ladder.target.version}]` }) : t('library.ladder.missing')}</h2>
                <div className="row">
                  <label className="field inline">
                    {t('library.ladder.steps')}
                    <select value={ladderSteps} onChange={(e) => { const n = Number(e.target.value); setLadderSteps(n); if (ladder.target) void showLadder(ladder.target.md5, n); }}>
                      {[3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn small ghost" onClick={() => setLadder(null)}>
                    {t('library.ladder.close')}
                  </button>
                </div>
              </div>
              {ladder.target && <p className="muted small">{t(`library.ladder.basis.${ladder.basis}`)}</p>}
              {ladder.target && ladder.steps.length <= 1 && <p className="warn-text small">{t('library.ladder.none')}</p>}
              <ol className="lib-steps">
                {ladder.steps.map((s) => (
                  <li key={s.map.md5} className={s.share === 1 ? 'target' : ''}>
                    <span className="lib-step-no">{s.share === 1 ? t('library.ladder.target') : s.step}</span>
                    <div className="lib-step-main">
                      <span className="lib-title">{s.map.artist} – {s.map.title} <span className="muted">[{s.map.version}]</span></span>
                      <span className="muted small">{metrics(s.map, ladder.basis)}{s.map.attempts > 0 ? ` · ${t('library.played', { count: s.map.attempts, acc: s.map.bestAccuracy === null ? '–' : f.num(s.map.bestAccuracy, 2) })}` : ''}</span>
                    </div>
                    <div className="lib-step-actions">
                      <button type="button" className="btn small" onClick={() => onAnalyze(s.map.md5)}>{t('library.analyze')}</button>
                      {(s.map.streamBpm ?? 0) > 0 && (
                        <button type="button" className="btn small" onClick={() => onTrain(s.map.md5)}>{t('library.train')}</button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="card lib-filters">
            <div className="row lib-filter-top">
              <input
                className="search lib-search"
                type="search"
                placeholder={t('library.search')}
                value={q.search ?? ''}
                onChange={(e) => update({ search: e.target.value })}
              />
              <select value={q.source ?? ''} onChange={(e) => update({ source: (e.target.value || null) as LibraryQuery['source'] })}>
                <option value="">{t('library.sourceAny')}</option>
                <option value="stable">osu!stable</option>
                <option value="lazer">osu!lazer</option>
              </select>
              <select value={q.played ?? 'any'} onChange={(e) => update({ played: e.target.value as LibraryQuery['played'] })}>
                <option value="any">{t('library.playedAny')}</option>
                <option value="played">{t('library.playedYes')}</option>
                <option value="new">{t('library.playedNew')}</option>
              </select>
              <button type="button" className="btn small ghost" onClick={() => setMore((m) => !m)}>
                {more ? t('library.lessFilters') : t('library.moreFilters')}
              </button>
              {activeFilters > 0 && (
                <button type="button" className="btn small ghost" onClick={() => update({ ...CLEAR, search: '', source: null, played: 'any' })}>
                  {t('library.reset')}
                </button>
              )}
            </div>
            <div className="lib-range-grid">
              {RANGES.slice(0, more ? RANGES.length : 6).map((r) => (
                <RangeField key={r.key} label={t(`library.f.${r.key}`)} step={r.step} value={q[r.key]} onChange={(v) => update({ [r.key]: v })} />
              ))}
            </div>
            {more && <p className="muted small">{t('library.starsHint')}</p>}
          </section>

          <section className="card lib-results">
            <div className="row lib-results-head">
              <strong>{data ? t('library.results', { count: data.total }) : '…'}</strong>
            </div>
            {data && data.total === 0 ? (
              <p className="muted">{t('library.noResults')}</p>
            ) : (
              <div className="lib-table-wrap">
                <table className="lib-table">
                  <thead>
                    <tr>
                      {col('title', t('library.col.map'), 'lib-col-map')}
                      {col('stars', '★')}
                      {col('bpm', 'BPM')}
                      {col('length', t('library.col.length'))}
                      {col(null, 'AR')}
                      {col(null, 'OD')}
                      {col('streamBpm', t('library.col.streamBpm'))}
                      {col('block', t('library.col.block'))}
                      {col('jumps', t('library.col.jumps'))}
                      {col(null, t('library.col.overlap'))}
                      {col('attempts', t('library.col.played'))}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((m) => (
                      <Fragment key={m.md5}>
                        <tr className={`lib-row${open === m.md5 ? ' open' : ''}`} onClick={() => setOpen(open === m.md5 ? null : m.md5)}>
                          <td className="lib-col-map">
                            <span className="lib-title">{m.artist} – {m.title}</span>
                            <span className="muted small">
                              [{m.version}] · {m.creator}
                              {m.source === 'lazer' ? ' · lazer' : ''}
                            </span>
                          </td>
                          <td className="num">{m.stars === null ? '–' : f.num(m.stars, 2)}</td>
                          <td className="num">{f.num(m.bpm)}</td>
                          <td className="num">{formatTime(m.lengthMs)}</td>
                          <td className="num">{f.num(m.ar, 1)}</td>
                          <td className="num">{f.num(m.od, 1)}</td>
                          <td className="num">{fmtNum(m.streamBpm)}</td>
                          <td className="num">{m.longestBlockMs > 0 ? `${f.num(m.longestBlockMs / 1000, 1)} s` : '–'}</td>
                          <td className="num">{f.num(m.jumpsPerMin, 1)}</td>
                          <td className="num">{f.num(m.overlapPct)}%</td>
                          <td className="num">{m.attempts > 0 ? `${m.attempts} · ${m.bestAccuracy === null ? '–' : `${f.num(m.bestAccuracy, 2)}%`}` : '–'}</td>
                        </tr>
                        {open === m.md5 && (
                          <tr className="lib-detail">
                            <td colSpan={11}>
                              <p className="small muted">
                                {t('library.detail', {
                                  objects: m.objects,
                                  cs: f.num(m.cs, 1),
                                  pct: f.num(m.streamPct, 1),
                                  notes: m.longestStream,
                                  spacing: m.streamSpacing === null ? '–' : f.num(m.streamSpacing, 2),
                                  dist: f.num(m.jumpDistance, 2)
                                })}
                              </p>
                              <div className="row">
                                <button type="button" className="btn small primary" onClick={() => onAnalyze(m.md5)}>{t('library.analyze')}</button>
                                {(m.streamBpm ?? 0) > 0 && (
                                  <button type="button" className="btn small" onClick={() => onTrain(m.md5)}>{t('library.train')}</button>
                                )}
                                <button type="button" className="btn small" onClick={() => void showLadder(m.md5)}>{t('library.ladderButton')}</button>
                                {m.attempts > 0 && (
                                  <button type="button" className="btn small" onClick={() => onOpenPlays({ beatmapMd5: m.md5, title: m.title, version: m.version })}>
                                    {t('library.yourPlays', { count: m.attempts })}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data && data.items.length < data.total && (
              <button
                type="button"
                className="btn small lib-more"
                onClick={() => void window.api.queryLibrary({ ...q, offset: data.items.length, limit: PAGE }).then((r) => setData({ items: [...data.items, ...r.items], total: r.total }))}
              >
                {t('library.showMore', { count: Math.min(PAGE, data.total - data.items.length) })}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
