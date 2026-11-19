import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Goal, GoalMetric, GoalProgress, MapGroup } from '../../../shared/api.ts';
import { makeFormatters, type Formatters } from '../format.ts';
import { useSettings } from './RhythmScreen.tsx';

const METRICS: GoalMetric[] = ['ur', 'k2k1', 'streamUr', 'entry', 'accuracy', 'mapAccuracy', 'plays', 'drills'];
const DEFAULT_TARGET: Record<GoalMetric, number> = { ur: 180, k2k1: 3, streamUr: 200, entry: 5, accuracy: 92, mapAccuracy: 95, plays: 20, drills: 5 };

export function formatGoalValue(metric: GoalMetric, v: number, f: Formatters, isTarget = false): string {
  switch (metric) {
    case 'ur':
    case 'streamUr':
      return f.num(v);
    case 'k2k1':
    case 'entry':
      // próg to wartość bezwzględna („w granicach ±3 ms”), obecna wartość ma znak
      return isTarget ? `${f.num(Math.abs(v), 1)} ms` : `${f.signed(v)} ms`;
    case 'accuracy':
    case 'mapAccuracy':
      return `${f.num(v, 2)}%`;
    default:
      return f.num(v);
  }
}

export function GoalRow({ p, f, onDelete }: { p: GoalProgress; f: Formatters; onDelete?: () => void }) {
  const { t } = useTranslation();
  const g = p.goal;
  return (
    <div className={`goal${p.reached ? ' reached' : ''}`}>
      <div className="goal-head">
        <b>{t(`goals.metric.${g.metric}`, { map: g.mapLabel ?? '', target: formatGoalValue(g.metric, g.target, f, true) })}</b>
        <span className="muted small">{t('goals.window', { count: g.days })}</span>
      </div>
      <div className="bar goal-bar">
        <span className="bar-fill" style={{ width: `${Math.round(p.progress * 100)}%` }} />
      </div>
      <div className="goal-foot small">
        <span>
          {p.current === null ? t('goals.noData') : t('goals.now', { value: formatGoalValue(g.metric, p.current, f) })}
          {p.current !== null && p.samples < 3 && !['plays', 'drills', 'mapAccuracy'].includes(g.metric) && ` · ${t('goals.fewSamples')}`}
        </span>
        {g.doneAt && <span className="good-text">✓ {t('goals.reachedOn', { date: f.date(g.doneAt) })}</span>}
        {onDelete && (
          <button type="button" className="link" onClick={onDelete}>
            {t('settings.remove')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function GoalsScreen() {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const { settings, update } = useSettings();
  const [progress, setProgress] = useState<GoalProgress[]>([]);
  const [maps, setMaps] = useState<MapGroup[]>([]);
  const [metric, setMetric] = useState<GoalMetric>('ur');
  const [target, setTarget] = useState(DEFAULT_TARGET.ur);
  const [days, setDays] = useState(14);
  const [map, setMap] = useState('');

  const refresh = () => void window.api.goalsProgress().then(setProgress);
  useEffect(() => {
    refresh();
    void window.api.listMaps({}).then(setMaps);
    return window.api.onReplayAdded(refresh);
  }, []);

  const add = async () => {
    if (!settings) return;
    const m = maps.find((x) => x.beatmapMd5 === map);
    if (metric === 'mapAccuracy' && !m) return;
    const goal: Goal = {
      id: `${Date.now().toString(36)}`,
      metric,
      target,
      days,
      createdAt: new Date().toISOString(),
      ...(m ? { beatmapMd5: m.beatmapMd5, mapLabel: `${m.title} [${m.version}]` } : {})
    };
    await update({ goals: [...(settings.goals ?? []), goal] });
    refresh();
  };

  const remove = async (id: string) => {
    if (!settings) return;
    await update({ goals: settings.goals.filter((g) => g.id !== id) });
    refresh();
  };

  const active = progress.filter((p) => !p.goal.doneAt);
  const done = progress.filter((p) => p.goal.doneAt);

  return (
    <div className="screen goals">
      <header className="screen-head">
        <h1>{t('goals.title')}</h1>
        <p className="muted">{t('goals.subtitle')}</p>
      </header>

      <section className="card settings-section">
        <h3>{t('goals.add')}</h3>
        <div className="controls-row">
          <label className="field">
            <span>{t('goals.what')}</span>
            <select
              value={metric}
              onChange={(e) => {
                const m = e.target.value as GoalMetric;
                setMetric(m);
                setTarget(DEFAULT_TARGET[m]);
                if (m === 'plays' || m === 'drills') setDays(7);
              }}
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(`goals.metricName.${m}`)}
                </option>
              ))}
            </select>
          </label>
          {metric === 'mapAccuracy' && (
            <label className="field">
              <span>{t('trainer.map')}</span>
              <select value={map} onChange={(e) => setMap(e.target.value)}>
                <option value="">—</option>
                {maps.map((m) => (
                  <option key={m.beatmapMd5} value={m.beatmapMd5}>
                    {m.title} [{m.version}] · {t('replay.maps.best', { acc: f.num(m.bestAccuracy, 2) })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t(`goals.targetLabel.${metric}`)}</span>
            <input type="number" value={target} step={metric === 'accuracy' || metric === 'mapAccuracy' ? 0.5 : 1} onChange={(e) => setTarget(Number(e.target.value) || 0)} />
          </label>
          <label className="field">
            <span>{t('goals.days')}</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {t('stats.days', { count: d })}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" disabled={metric === 'mapAccuracy' && !map} onClick={() => void add()}>
            {t('goals.addButton')}
          </button>
        </div>
        <p className="muted small">{t(`goals.hint.${metric}`)}</p>
      </section>

      <h2>{t('goals.active')}</h2>
      {active.length === 0 && <p className="muted small">{t('goals.none')}</p>}
      <div className="goal-grid">
        {active.map((p) => (
          <div key={p.goal.id} className="card">
            <GoalRow p={p} f={f} onDelete={() => void remove(p.goal.id)} />
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <>
          <h2>{t('goals.done')}</h2>
          <div className="goal-grid">
            {done.map((p) => (
              <div key={p.goal.id} className="card">
                <GoalRow p={p} f={f} onDelete={() => void remove(p.goal.id)} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
