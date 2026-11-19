import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Recommendation, Settings, Todo } from '../../../shared/api.ts';
import { useSettings } from './RhythmScreen.tsx';

/** Dzień tygodnia 0–6 od poniedziałku. */
export const weekday = (d = new Date()) => (d.getDay() + 6) % 7;
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function isDoneToday(todo: Todo): boolean {
  return todo.repeat.length ? todo.doneOn === dayKey() : todo.done;
}

/** Zadania na dziś: jednorazowe niezrobione (i zrobione dziś) + powtarzalne na dzisiejszy dzień tygodnia. */
export function todayTodos(todos: Todo[]): Todo[] {
  const wd = weekday();
  return todos.filter((x) => (x.repeat.length ? x.repeat.includes(wd) : !x.done || x.doneOn === dayKey()));
}

export function toggleTodo(todos: Todo[], id: string): Todo[] {
  return todos.map((x) => {
    if (x.id !== id) return x;
    if (x.repeat.length) return { ...x, doneOn: x.doneOn === dayKey() ? undefined : dayKey() };
    return { ...x, done: !x.done, doneOn: !x.done ? dayKey() : undefined };
  });
}

export function TodoList({ todos, settings, update }: { todos: Todo[]; settings: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  return (
    <ul className="todo-list">
      {todos.map((x) => (
        <li key={x.id} className={isDoneToday(x) ? 'done' : ''}>
          <label className="check">
            <input type="checkbox" checked={isDoneToday(x)} onChange={() => void update({ todos: toggleTodo(settings.todos, x.id) })} />
            <span>{x.text}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export default function PlanScreen({ onStartRecommendation }: { onStartRecommendation: (r: Recommendation) => void }) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [text, setText] = useState('');
  const [repeat, setRepeat] = useState<number[]>([]);
  const [recos, setRecos] = useState<Recommendation[]>([]);
  const days = t('plan.weekdays').split(',');

  useEffect(() => {
    void window.api.dashboard().then((d) => setRecos(d.recommendations));
  }, []);

  if (!settings) return null;
  const todos = settings.todos ?? [];
  const save = (next: Todo[]) => update({ todos: next });
  const add = (value: string, rep: number[]) => {
    if (!value.trim()) return;
    void save([...todos, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: value.trim(), done: false, repeat: rep, createdAt: new Date().toISOString() }]);
  };

  const recoText = (r: Recommendation) =>
    r.screen === 'rhythm'
      ? t('dashboard.recoRhythm', { name: t(`rhythm.ex.${r.exercise}.name`), bpm: r.bpm })
      : r.mode === 'ladder'
        ? t('dashboard.recoLadder', { length: r.length ?? 7, bpm: r.bpm })
        : t('dashboard.recoStream', { bpm: r.bpm, seconds: r.seconds ?? 30 });

  return (
    <div className="screen plan">
      <header className="screen-head">
        <h1>{t('plan.title')}</h1>
        <p className="muted">{t('plan.subtitle')}</p>
      </header>

      <section className="card settings-section">
        <h3>{t('plan.add')}</h3>
        <form
          className="controls-row"
          onSubmit={(e) => {
            e.preventDefault();
            add(text, repeat);
            setText('');
          }}
        >
          <label className="field grow">
            <span>{t('plan.task')}</span>
            <input className="search" value={text} placeholder={t('plan.placeholder')} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="field">
            <span>{t('plan.repeat')}</span>
            <span className="segmented">
              {days.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={repeat.includes(i) ? 'on' : ''}
                  aria-pressed={repeat.includes(i)}
                  onClick={() => setRepeat((r) => (r.includes(i) ? r.filter((x) => x !== i) : [...r, i].sort()))}
                >
                  {d}
                </button>
              ))}
            </span>
          </div>
          <button type="submit" className="btn primary" disabled={!text.trim()}>
            {t('plan.addButton')}
          </button>
        </form>
        <p className="muted small">{t('plan.repeatHint')}</p>
      </section>

      {recos.length > 0 && (
        <>
          <h2>{t('plan.fromData')}</h2>
          <div className="reco-grid">
            {recos.map((r) => (
              <div key={r.id} className="card reco">
                <div className="reco-title">{t(`dashboard.reco.${r.reason}.title`)}</div>
                <div className="reco-what">{recoText(r)}</div>
                <div className="row">
                  <button type="button" className="btn small" onClick={() => add(recoText(r), [0, 2, 4])}>
                    {t('plan.addMWF')}
                  </button>
                  <button type="button" className="btn small" onClick={() => add(recoText(r), [])}>
                    {t('plan.addOnce')}
                  </button>
                  <button type="button" className="btn small primary" onClick={() => onStartRecommendation(r)}>
                    {t('dashboard.startThis')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>{t('plan.week')}</h2>
      <div className="week-grid">
        {days.map((d, i) => {
          const list = todos.filter((x) => x.repeat.includes(i));
          return (
            <div key={i} className={`card week-day${i === weekday() ? ' today' : ''}`}>
              <div className="week-day-name">{d}</div>
              {list.length === 0 ? <span className="muted small">—</span> : <TodoList todos={list} settings={settings} update={update} />}
            </div>
          );
        })}
      </div>

      <h2>{t('plan.once')}</h2>
      <div className="card">
        {todos.filter((x) => !x.repeat.length).length === 0 ? (
          <p className="muted small">{t('plan.noOnce')}</p>
        ) : (
          <TodoList todos={todos.filter((x) => !x.repeat.length)} settings={settings} update={update} />
        )}
      </div>

      {todos.length > 0 && (
        <>
          <h2>{t('plan.manage')}</h2>
          <div className="card">
            <ul className="plain-list">
              {todos.map((x) => (
                <li key={x.id} className="todo-manage">
                  <span>
                    {x.text}{' '}
                    <span className="muted small">{x.repeat.length ? x.repeat.map((i) => days[i]).join(' ') : t('plan.onceShort')}</span>
                  </span>
                  <button type="button" className="link" onClick={() => void save(todos.filter((y) => y.id !== x.id))}>
                    {t('settings.remove')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
