import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardData, DashboardTotals, Recommendation, SessionSummary } from '../../../shared/api.ts';
import type { ScreenId } from '../components/Sidebar.tsx';
import { makeFormatters, type Formatters } from '../format.ts';
import type { GoalProgress } from '../../../shared/api.ts';
import { GoalRow } from './GoalsScreen.tsx';
import { TodoList, todayTodos } from './PlanScreen.tsx';
import { useSettings } from './RhythmScreen.tsx';

interface Props {
  onOpen: (screen: ScreenId) => void;
  onOpenReplay: (id: string) => void;
  onStartRecommendation: (r: Recommendation) => void;
}

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

  return (
    <div className="screen dashboard">
      <header className="screen-head">
        <h1>{t('dashboard.title')}</h1>
        <p className="muted">{empty ? t('dashboard.emptySubtitle') : t('dashboard.subtitle2')}</p>
      </header>

      <div className="row quick">
        <button type="button" className="btn primary" onClick={() => onOpen('replays')}>
          {t('dashboard.openReplay')}
        </button>
        <button type="button" className="btn" onClick={() => onOpen('stats')}>
          {t('nav.stats')}
        </button>
        <button type="button" className="btn" onClick={() => onOpen('rhythm')}>
          {t('nav.rhythm')}
        </button>
        <button type="button" className="btn" onClick={() => onOpen('mapAnalysis')}>
          {t('dashboard.openAnalyzer')}
        </button>
      </div>

      {d && !empty && (
        <>
          <div className="grid dash-tiles">
            <div className="card stat">
              <div className="stat-label">{t('dashboard.today')}</div>
              <div className="stat-value">{t('stats.plays', { count: d.today.plays })}</div>
              <div className="stat-hint">
                {t('dashboard.drillsToday', { count: d.today.drills })}
                {d.today.ur !== null && ` · UR ${f.num(d.today.ur)}`}
              </div>
            </div>
            <WeekTile label="UR" now={d.week} prev={d.previousWeek} pick={(x) => x.ur} format={(v) => f.num(v)} better="down" f={f} />
            <WeekTile label="K2−K1" now={d.week} prev={d.previousWeek} pick={(x) => x.k2k1} format={(v) => `${f.signed(v)} ms`} better="zero" f={f} />
            <WeekTile label={t('replay.progress.accuracy')} now={d.week} prev={d.previousWeek} pick={(x) => x.accuracy} format={(v) => `${f.num(v, 2)}%`} better="up" f={f} />
            <div className="card stat">
              <div className="stat-label">{t('dashboard.streak')}</div>
              <div className="stat-value">{t('dashboard.days', { count: d.streak })}</div>
              <div className="stat-hint">{t('dashboard.streakHint')}</div>
            </div>
          </div>

          {(today.length > 0 || goals.some((g) => !g.goal.doneAt)) && settings && (
            <div className="dash-columns">
              <section>
                <h2>{t('dashboard.todayTodos')}</h2>
                <div className="card">
                  {today.length ? (
                    <TodoList todos={today} settings={settings} update={update} />
                  ) : (
                    <p className="muted small">
                      {t('dashboard.noTodos')}{' '}
                      <button type="button" className="link" onClick={() => onOpen('plan')}>
                        {t('nav.plan')}
                      </button>
                    </p>
                  )}
                </div>
              </section>
              <section>
                <h2>{t('nav.goals')}</h2>
                <div className="card goal-stack">
                  {goals.filter((g) => !g.goal.doneAt).slice(0, 4).map((g) => (
                    <GoalRow key={g.goal.id} p={g} f={f} />
                  ))}
                  {!goals.some((g) => !g.goal.doneAt) && (
                    <button type="button" className="link" onClick={() => onOpen('goals')}>
                      {t('goals.add')}
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}

          <h2>{t('dashboard.todayPlan')}</h2>
          <div className="reco-grid">
            {d.recommendations.map((r) => (
              <div key={r.id} className="card reco">
                <div className="reco-title">{t(`dashboard.reco.${r.reason}.title`)}</div>
                <p className="muted small">
                  {t(`dashboard.reco.${r.reason}.why`, { value: r.value === undefined ? '' : f.signed(r.value), bpm: r.bpm })}
                </p>
                <div className="reco-what">
                  {r.screen === 'rhythm'
                    ? t('dashboard.recoRhythm', { name: t(`rhythm.ex.${r.exercise}.name`), bpm: r.bpm })
                    : r.mode === 'ladder'
                      ? t('dashboard.recoLadder', { length: r.length ?? 7, bpm: r.bpm })
                      : t('dashboard.recoStream', { bpm: r.bpm, seconds: r.seconds ?? 30 })}
                </div>
                <button type="button" className="btn small primary" onClick={() => onStartRecommendation(r)}>
                  {t('dashboard.startThis')}
                </button>
              </div>
            ))}
          </div>

          <div className="dash-columns">
            <section>
              <h2>{t('dashboard.latest')}</h2>
              <div className="card">
                <ul className="history-list">
                  {d.latest.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="history-item" onClick={() => onOpenReplay(s.id)}>
                        <span className="history-title">
                          {s.title} <span className="muted">[{s.version}]</span>
                        </span>
                        <span className="history-stats">
                          <span>{f.date(s.playedAt)}</span>
                          <b>{f.num(s.accuracy, 2)}%</b>
                          <span>UR {f.num(s.ur)}</span>
                          <span>K2−K1 {f.signed(s.k2Mean - s.k1Mean)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <section>
              <h2>{t('dashboard.lastSession')}</h2>
              {d.lastSession ? <SessionCard s={d.lastSession} f={f} onMore={() => onOpen('sessions')} /> : <p className="muted small">—</p>}
              {d.recentDrills.length > 0 && (
                <>
                  <h2>{t('dashboard.recentDrills')}</h2>
                  <div className="card">
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
                  </div>
                </>
              )}
            </section>
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

function WeekTile({
  label,
  now,
  prev,
  pick,
  format,
  better,
  f
}: {
  label: string;
  now: DashboardTotals;
  prev: DashboardTotals | null;
  pick: (x: DashboardTotals) => number | null;
  format: (v: number) => string;
  better: 'up' | 'down' | 'zero';
  f: Formatters;
}) {
  const { t } = useTranslation();
  const v = pick(now);
  const p = prev ? pick(prev) : null;
  let hint = t('dashboard.thisWeek');
  let tone = '';
  if (v !== null && p !== null) {
    const d = v - p;
    const improvement = better === 'up' ? d : better === 'down' ? -d : Math.abs(p) - Math.abs(v);
    tone = Math.abs(d) < 0.05 ? '' : improvement > 0 ? 'good-text' : 'warn-text';
    hint = t('dashboard.vsLastWeek', { value: f.signed(d, Math.abs(d) < 10 ? 1 : 0) });
  }
  return (
    <div className="card stat">
      <div className="stat-label">
        {label} · {t('dashboard.week')}
      </div>
      <div className="stat-value">{v === null ? '—' : format(v)}</div>
      <div className={`stat-hint ${tone}`}>{hint}</div>
    </div>
  );
}

export function SessionCard({ s, f, onMore, onOpenReplay }: { s: SessionSummary; f: Formatters; onMore?: () => void; onOpenReplay?: (id: string) => void }) {
  const { t } = useTranslation();
  const minutes = Math.max(1, Math.round(s.durationMs / 60000));
  return (
    <div className="card session">
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
