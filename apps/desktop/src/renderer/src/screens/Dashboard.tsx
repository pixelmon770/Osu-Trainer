import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardData, DashboardTotals, Recommendation, SessionSummary } from '../../../shared/api.ts';
import type { ScreenId } from '../components/Sidebar.tsx';
import { makeFormatters, type Formatters } from '../format.ts';
import type { GoalProgress } from '../../../shared/api.ts';
import { GoalRow } from './GoalsScreen.tsx';
import { isDoneToday, TodoList, todayTodos } from './PlanScreen.tsx';
import { useSettings } from './RhythmScreen.tsx';

interface Props {
  onOpen: (screen: ScreenId) => void;
  onOpenReplay: (id: string) => void;
  onStartRecommendation: (r: Recommendation) => void;
}

/** Kategoria podpowiedzi – kolorowa etykieta jak w projekcie („Timing”, „Zmęczenie”…). */
const CATEGORY: Record<Recommendation['reason'], { key: 'timing' | 'streams' | 'stamina' | 'routine'; color: string }> = {
  keyGap: { key: 'timing', color: '#f5b27a' },
  keyGapEven: { key: 'timing', color: '#f5b27a' },
  entry: { key: 'timing', color: '#f5b27a' },
  streamUr: { key: 'streams', color: '#8fb3ff' },
  fatigue: { key: 'stamina', color: '#f5b27a' },
  maintain: { key: 'routine', color: '#7ee0a1' },
  noData: { key: 'routine', color: '#7ee0a1' }
};

export default function Dashboard({ onOpen, onOpenReplay, onStartRecommendation }: Props) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const [d, setD] = useState<DashboardData | null>(null);
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const { settings, update } = useSettings();
  const today = settings ? todayTodos(settings.todos ?? []) : [];

  useEffect(() => {
    void window.api.dashboard().then(setD);
    void window.api.goalsProgress().then(setGoals);
    return window.api.onReplayAdded(() => void window.api.dashboard().then(setD));
  }, []);

  const empty = d && d.week.plays === 0 && d.recentDrills.length === 0;
  const top = d?.recommendations[0] ?? null;
  const recoWhat = (r: Recommendation) =>
    r.screen === 'rhythm'
      ? t('dashboard.recoRhythm', { name: t(`rhythm.ex.${r.exercise}.name`), bpm: r.bpm })
      : r.mode === 'ladder'
        ? t('dashboard.recoLadder', { length: r.length ?? 7, bpm: r.bpm })
        : t('dashboard.recoStream', { bpm: r.bpm, seconds: r.seconds ?? 30 });
  const recoWhy = (r: Recommendation) => t(`dashboard.reco.${r.reason}.why`, { value: r.value === undefined ? '' : f.signed(r.value), bpm: r.bpm });
  const dateLine = (() => {
    const s = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const doneToday = today.filter((x) => isDoneToday(x)).length;
  const activeGoals = goals.filter((g) => !g.goal.doneAt);

  return (
    <div className="screen dashboard">
      <section className="hero">
        <div className="hero-main">
          <span className="hero-date">
            {dateLine}
            {d && !empty ? ` · ${t('dashboard.streak')}: ${t('dashboard.days', { count: d.streak })}` : ''}
          </span>
          <h1>{empty || !top ? t('dashboard.title') : t(`dashboard.reco.${top.reason}.title`)}</h1>
          <p>{empty ? t('dashboard.emptySubtitle') : top ? recoWhy(top) : t('dashboard.subtitle2')}</p>
        </div>
        {d && !empty && (
          <div className="hero-side">
            {top && (
              <div className="hero-pill">
                <span>{t('dashboard.exercise')}</span>
                <strong>{recoWhat(top)}</strong>
                <button type="button" className="btn small primary" onClick={() => onStartRecommendation(top)}>
                  {t('dashboard.startThis')}
                </button>
              </div>
            )}
            <div className="hero-pill">
              <span>{t('dashboard.lastSession')}</span>
              <strong>{d.lastSession ? f.date(d.lastSession.start) : '—'}</strong>
              <button type="button" className="btn small" onClick={() => onOpen('sessions')}>
                {t('dashboard.allSessions')}
              </button>
            </div>
          </div>
        )}
      </section>

      {d && !empty && (
        <>
          <section className="tiles" aria-label={t('dashboard.week')}>
            <WeekTile color="blue" icon="trend" label={t('replay.progress.accuracy')} now={d.week} prev={d.previousWeek} pick={(x) => x.accuracy} format={(v) => `${f.num(v, 2)}%`} better="up" f={f} />
            <WeekTile color="green" icon="target" label="UR" now={d.week} prev={d.previousWeek} pick={(x) => x.ur} format={(v) => f.num(v)} better="down" f={f} />
            <WeekTile color="violet" icon="keys" label="K2−K1" now={d.week} prev={d.previousWeek} pick={(x) => x.k2k1} format={(v) => `${f.signed(v)} ms`} better="zero" f={f} />
            <div className="tile yellow">
              <TileIcon kind="clock" />
              <div className="tile-body">
                <span className="tile-value">{t('stats.plays', { count: d.today.plays })}</span>
                <span className="tile-caption">
                  {t('dashboard.today')} · {t('dashboard.drillsToday', { count: d.today.drills })}
                  {d.today.ur !== null && ` · UR ${f.num(d.today.ur)}`}
                </span>
              </div>
            </div>
          </section>

          <div className="dash-row">
            <section className="card dash-card grow">
              <div className="card-head">
                <h2>{t('dashboard.todayTodos')}</h2>
                {today.length > 0 && <span className="muted small">{t('dashboard.doneOf', { done: doneToday, total: today.length })}</span>}
              </div>
              {today.length > 0 && settings ? (
                <>
                  <div className="progress-bar" aria-hidden>
                    <div style={{ width: `${(doneToday / today.length) * 100}%` }} />
                  </div>
                  <TodoList todos={today} settings={settings} update={update} />
                </>
              ) : (
                <p className="muted small">
                  {t('dashboard.noTodos')}{' '}
                  <button type="button" className="link" onClick={() => onOpen('plan')}>
                    {t('nav.plan')}
                  </button>
                </p>
              )}
            </section>

            <section className="card dash-card">
              <h2>{t('dashboard.noticed')}</h2>
              <div className="notice-list">
                {d.recommendations.map((r) => (
                  <div key={r.id} className="notice">
                    <span className="notice-cat" style={{ color: CATEGORY[r.reason].color }}>
                      {t(`dashboard.cat.${CATEGORY[r.reason].key}`)}
                    </span>
                    <span className="notice-title">{t(`dashboard.reco.${r.reason}.title`)}</span>
                    <span className="muted small">{recoWhy(r)}</span>
                    <div className="notice-do">
                      <span>{recoWhat(r)}</span>
                      <button type="button" className="btn small" onClick={() => onStartRecommendation(r)}>
                        {t('dashboard.startThis')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {activeGoals.length > 0 && (
            <section className="card dash-card">
              <div className="card-head">
                <h2>{t('nav.goals')}</h2>
                <button type="button" className="link" onClick={() => onOpen('goals')}>
                  {t('dashboard.seeAll')}
                </button>
              </div>
              <div className="goal-grid">
                {activeGoals.slice(0, 4).map((g) => (
                  <GoalRow key={g.goal.id} p={g} f={f} />
                ))}
              </div>
            </section>
          )}

          <section className="card dash-card">
            <div className="card-head">
              <h2>{t('dashboard.latest')}</h2>
              <button type="button" className="link" onClick={() => onOpen('replays')}>
                {t('dashboard.seeAll')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('library.col.map')}</th>
                    <th className="num">{t('replay.progress.accuracy')}</th>
                    <th className="num">UR</th>
                    <th className="num">K2−K1</th>
                    <th className="num">{t('dashboard.colDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.latest.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => onOpenReplay(s.id)}>
                      <td>
                        <span className="cell-title">{s.title}</span> <span className="muted">[{s.version}]</span>
                        {s.mods.length > 0 && <span className="muted"> · {s.mods.join('')}</span>}
                      </td>
                      <td className="num strong">{f.num(s.accuracy, 2)}%</td>
                      <td className="num">{f.num(s.ur)}</td>
                      <td className="num">{f.signed(s.k2Mean - s.k1Mean)} ms</td>
                      <td className="num muted">{f.date(s.playedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="dash-row">
            {d.lastSession && (
              <section className="dash-col">
                <SessionCard s={d.lastSession} f={f} onMore={() => onOpen('sessions')} onOpenReplay={onOpenReplay} title={t('dashboard.lastSession')} />
              </section>
            )}
            {d.recentDrills.length > 0 && (
              <section className="card dash-card grow">
                <h2>{t('dashboard.recentDrills')}</h2>
                <ul className="plain-list">
                  {d.recentDrills.map((r) => (
                    <li key={r.id}>
                      <span>{r.label || r.name}</span>
                      <span className="muted small">
                        {f.date(r.createdAt)} · {f.num(r.bpm)} BPM · UR {f.num(r.ur)} · K2−K1 {f.signed(r.k2Mean - r.k1Mean)} ms
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}

      {empty && (
        <div className="card soon-card">
          <p className="muted">{t('dashboard.emptyHint')}</p>
          <div className="row">
            <button type="button" className="btn small" onClick={() => onOpen('settings')}>
              {t('nav.settings')}
            </button>
            <button type="button" className="btn small" onClick={() => onOpen('rhythm')}>
              {t('rhythm.calibration.start')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type TileKind = 'trend' | 'target' | 'keys' | 'clock';
function TileIcon({ kind }: { kind: TileKind }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === 'trend' && (
        <>
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="15 7 21 7 21 13" />
        </>
      )}
      {kind === 'target' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </>
      )}
      {kind === 'keys' && (
        <>
          <path d="M8 4v16M16 4v16" />
          <path d="M5 9h6M13 15h6" />
        </>
      )}
      {kind === 'clock' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </>
      )}
    </svg>
  );
}

function WeekTile({
  label,
  now,
  prev,
  pick,
  format,
  better,
  f,
  color,
  icon
}: {
  label: string;
  now: DashboardTotals;
  prev: DashboardTotals | null;
  pick: (x: DashboardTotals) => number | null;
  format: (v: number) => string;
  better: 'up' | 'down' | 'zero';
  f: Formatters;
  color: 'blue' | 'green' | 'violet' | 'yellow';
  icon: TileKind;
}) {
  const { t } = useTranslation();
  const v = pick(now);
  const p = prev ? pick(prev) : null;
  let hint = t('dashboard.thisWeek');
  let tone = '';
  if (v !== null && p !== null) {
    const d = v - p;
    const improvement = better === 'up' ? d : better === 'down' ? -d : Math.abs(p) - Math.abs(v);
    tone = Math.abs(d) < 0.05 ? '' : improvement > 0 ? 'up' : 'down';
    hint = t('dashboard.vsLastWeek', { value: f.signed(d, Math.abs(d) < 10 ? 1 : 0) });
  }
  return (
    <div className={`tile ${color}`}>
      <TileIcon kind={icon} />
      <div className="tile-body">
        <span className="tile-label">
          {label} · {t('dashboard.week')}
        </span>
        <span className="tile-value">{v === null ? '—' : format(v)}</span>
        <span className={`tile-caption ${tone}`}>{hint}</span>
      </div>
    </div>
  );
}

export function SessionCard({
  s,
  f,
  onMore,
  onOpenReplay,
  title
}: {
  s: SessionSummary;
  f: Formatters;
  onMore?: () => void;
  onOpenReplay?: (id: string) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const minutes = Math.max(1, Math.round(s.durationMs / 60000));
  return (
    <div className="card session">
      {title && <h2>{title}</h2>}
      <div className="session-head">
        <b>{f.date(s.start)}</b>
        <span className="muted small">{t('sessions.duration', { minutes })}</span>
      </div>
      <div className="history-stats">
        <span>{t('stats.plays', { count: s.plays })}</span>
        {s.drills > 0 && <span>{t('dashboard.drillsToday', { count: s.drills })}</span>}
        {s.ur !== null && <span>UR {f.num(s.ur)}</span>}
        {s.accuracy !== null && <span>{f.num(s.accuracy, 2)}%</span>}
        {s.k2k1 !== null && <span>K2−K1 {f.signed(s.k2k1)} ms</span>}
      </div>
      {s.warmup && (
        <p className={`small ${s.warmup.firstUr > s.warmup.restUr * 1.05 ? 'warn-text' : 'muted'}`}>
          {s.warmup.firstUr > s.warmup.restUr * 1.05
            ? t('sessions.warmupSlow', { first: f.num(s.warmup.firstUr), rest: f.num(s.warmup.restUr) })
            : t('sessions.warmupOk', { first: f.num(s.warmup.firstUr), rest: f.num(s.warmup.restUr) })}
        </p>
      )}
      {s.fatigue && (
        <p className={`small ${s.fatigue.endUr > s.fatigue.middleUr * 1.1 ? 'warn-text' : 'muted'}`}>
          {s.fatigue.endUr > s.fatigue.middleUr * 1.1
            ? t('sessions.fatigueYes', { middle: f.num(s.fatigue.middleUr), end: f.num(s.fatigue.endUr) })
            : t('sessions.fatigueNo', { middle: f.num(s.fatigue.middleUr), end: f.num(s.fatigue.endUr) })}
        </p>
      )}
      {s.best && (
        <p className="small">
          {t('sessions.best')}:{' '}
          {onOpenReplay ? (
            <button type="button" className="link" onClick={() => onOpenReplay(s.best!.id)}>
              {s.best.title} [{s.best.version}] · {f.num(s.best.accuracy, 2)}%
            </button>
          ) : (
            <span>
              {s.best.title} [{s.best.version}] · {f.num(s.best.accuracy, 2)}%
            </span>
          )}
        </p>
      )}
      {onMore && (
        <button type="button" className="btn small ghost" onClick={onMore}>
          {t('dashboard.allSessions')}
        </button>
      )}
    </div>
  );
}
