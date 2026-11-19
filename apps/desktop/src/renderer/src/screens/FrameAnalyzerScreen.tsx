import type { NoteResult } from '@osu-trainer/analyzer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaybackData, ReplaySummary } from '../../../shared/api.ts';
import { formatTime, makeFormatters } from '../format.ts';
import { cursorAt, draw, prepare, type Prepared } from '../frame/draw.ts';

const SPEEDS = [0.05, 0.1, 0.25, 0.5, 0.75, 1];

export default function FrameAnalyzerScreen({ openId, onOpened }: { openId: string | null; onOpened: () => void }) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const [list, setList] = useState<ReplaySummary[]>([]);
  const [search, setSearch] = useState('');
  const [id, setId] = useState<string | null>(openId);
  const [data, setData] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.25);
  const canvas = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    if (openId) {
      setId(openId);
      onOpened();
    }
  }, [openId, onOpened]);

  useEffect(() => {
    const timer = setTimeout(() => void window.api.queryReplays({ search, limit: 300 }).then((r) => setList(r.items)), 150);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!id) return;
    setData(null);
    setError(null);
    setPlaying(false);
    void window.api.playback(id).then((p) => {
      if ('error' in p) return setError(p.error);
      const prepared = prepare(p as PlaybackData);
      setData(prepared);
      // start przy pierwszym missie, a jeśli go nie ma – przy pierwszej nucie
      const firstMiss = prepared.data.analysis.notes.find((n) => n.judgement === 0);
      const start = (firstMiss?.time ?? prepared.data.objects[0]?.time ?? 0) - 1000;
      timeRef.current = start;
      setTime(start);
    });
  }, [id]);

  const paint = useCallback(() => {
    const c = canvas.current;
    if (!c || !data) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    if (c.width !== Math.round(rect.width * dpr) || c.height !== Math.round(rect.height * dpr)) {
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, rect.width, rect.height, data, timeRef.current);
  }, [data]);

  // odtwarzanie
  useEffect(() => {
    if (!data) return;
    let raf = 0;
    let last = performance.now();
    const end = data.data.frames.at(-1)?.[0] ?? 0;
    const loop = (now: number) => {
      if (playing) {
        timeRef.current = Math.min(end, timeRef.current + (now - last) * speed);
        if (timeRef.current >= end) setPlaying(false);
        setTime(timeRef.current);
      }
      last = now;
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, playing, speed, paint]);

  const seek = useCallback((ms: number) => {
    timeRef.current = ms;
    setTime(ms);
  }, []);

  const notes = data?.data.analysis.notes ?? [];
  const problems = useMemo(() => notes.filter((n) => n.judgement !== 300 && n.time <= (data?.data.frames.at(-1)?.[0] ?? 0)), [notes, data]);

  const stepFrame = useCallback(
    (dir: 1 | -1) => {
      if (!data) return;
      const frames = data.data.frames;
      const { index } = cursorAt(frames, timeRef.current);
      const next = frames[Math.max(0, Math.min(frames.length - 1, index + (dir > 0 ? 1 : frames[index]![0] < timeRef.current ? 0 : -1)))]!;
      seek(next[0]);
    },
    [data, seek]
  );

  const jumpProblem = useCallback(
    (dir: 1 | -1, onlyMiss: boolean) => {
      const list = onlyMiss ? problems.filter((n) => n.judgement === 0) : problems;
      const now = timeRef.current + 500; // punkt startowy to 0,5 s przed nutą
      const target = dir > 0 ? list.find((n) => n.time > now + 1) : [...list].reverse().find((n) => n.time < now - 1);
      if (target) seek(target.time - 500);
    },
    [problems, seek]
  );

  // skróty klawiszowe
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        setPlaying(false);
        const dir = e.code === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey) seek(timeRef.current + dir * 1000);
        else stepFrame(dir);
      } else if (e.code === 'BracketRight' || e.code === 'Period') jumpProblem(1, e.code === 'Period');
      else if (e.code === 'BracketLeft' || e.code === 'Comma') jumpProblem(-1, e.code === 'Comma');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, stepFrame, jumpProblem]);

  // nuta „w centrum uwagi”: najbliższa w czasie (±400 ms)
  const focus: NoteResult | null = useMemo(() => {
    let best: NoteResult | null = null;
    for (const n of notes) {
      const d = Math.abs(n.time - time);
      if (d <= 400 && (!best || d < Math.abs(best.time - time))) best = n;
      if (n.time > time + 400) break;
    }
    return best;
  }, [notes, time]);

  const end = data?.data.frames.at(-1)?.[0] ?? 1;
  const start = Math.min(0, data?.data.frames[0]?.[0] ?? 0);
  const pct = (ms: number) => ((ms - start) / (end - start)) * 100;
  const cur = data ? cursorAt(data.data.frames, time) : null;

  return (
    <div className="screen frame-analyzer">
      <header className="screen-head">
        <h1>{t('frame.title')}</h1>
        <p className="muted">{t('frame.subtitle')}</p>
      </header>

      <div className="frame-layout">
        <aside className="card history">
          <input type="search" className="search" placeholder={t('replay.filter.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="history-list">
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" className={`history-item${s.id === id ? ' active' : ''}`} onClick={() => setId(s.id)}>
                  <span className="history-title">
                    {s.title} <span className="muted">[{s.version}]</span>
                  </span>
                  <span className="history-stats">
                    <span>{f.date(s.playedAt)}</span>
                    <b>{f.num(s.accuracy, 2)}%</b>
                    <span>✕ {s.countMiss}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="frame-main">
          {!id && <p className="muted">{t('frame.pick')}</p>}
          {error && <div className="card error">{t(`frame.error.${error}`, { defaultValue: error })}</div>}
          {data && (
            <>
              <div className="card frame-card">
                <div className="frame-title">
                  <b>{data.data.title}</b>
                  {data.data.mods.length > 0 && <span className="chip">{data.data.mods.join(' ')}</span>}
                </div>
                <canvas ref={canvas} className="playfield" onClick={() => setPlaying((p) => !p)} />
                <div className="seek">
                  <div className="seek-marks" aria-hidden>
                    {problems.map((n) => (
                      <span key={n.index} className={`mark j${n.judgement}`} style={{ left: `${pct(n.time)}%` }} />
                    ))}
                  </div>
                  <input
                    type="range"
                    min={start}
                    max={end}
                    step={1}
                    value={time}
                    aria-label={t('frame.seek')}
                    onChange={(e) => {
                      setPlaying(false);
                      seek(Number(e.target.value));
                    }}
                  />
                </div>
                <div className="frame-controls">
                  <button type="button" className="btn small" onClick={() => jumpProblem(-1, true)} title=",">
                    ⏮ {t('frame.prevMiss')}
                  </button>
                  <button type="button" className="btn small" onClick={() => stepFrame(-1)} title="←">
                    ◀ {t('frame.frame')}
                  </button>
                  <button type="button" className="btn small primary" onClick={() => setPlaying((p) => !p)} title="Space">
                    {playing ? t('frame.pause') : t('frame.play')}
                  </button>
                  <button type="button" className="btn small" onClick={() => stepFrame(1)} title="→">
                    {t('frame.frame')} ▶
                  </button>
                  <button type="button" className="btn small" onClick={() => jumpProblem(1, true)} title=".">
                    {t('frame.nextMiss')} ⏭
                  </button>
                  <label className="field inline">
                    <span>{t('frame.speed')}</span>
                    <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                      {SPEEDS.map((s) => (
                        <option key={s} value={s}>
                          {s}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="mono">
                    {formatTime(time)}.{String(Math.floor(Math.abs(time) % 1000)).padStart(3, '0')}
                  </span>
                </div>
                <p className="muted small">{t('frame.shortcuts')}</p>
              </div>

              <div className="frame-side">
                <div className="card">
                  <h3>{t('frame.note')}</h3>
                  {focus ? (
                    <dl className="facts">
                      <dt>{t('frame.noteNo')}</dt>
                      <dd>
                        #{focus.index + 1} · {focus.kind === 'slider' ? t('frame.slider') : t('frame.circle')}
                      </dd>
                      <dt>{t('frame.judgement')}</dt>
                      <dd className={`j${focus.judgement}`}>{focus.judgement === 0 ? `✕ ${t(`frame.miss.${focus.missKind}`)}` : focus.judgement}</dd>
                      <dt>{t('frame.hitError')}</dt>
                      <dd>{focus.errorMs === null ? '—' : `${f.signed(focus.errorMs, 0)} ms`}</dd>
                      <dt>{t('frame.key')}</dt>
                      <dd>{focus.key ?? '—'}</dd>
                      <dt>{t('frame.distance')}</dt>
                      <dd>{focus.distance === null ? '—' : `${f.num(focus.distance * 100)}% r`}</dd>
                      {focus.streamPosition !== null && (
                        <>
                          <dt>{t('frame.stream')}</dt>
                          <dd>{t('frame.streamPos', { pos: focus.streamPosition })}</dd>
                        </>
                      )}
                    </dl>
                  ) : (
                    <p className="muted small">{t('frame.noNote')}</p>
                  )}
                  {cur && (
                    <p className="muted small mono">
                      {t('frame.cursor')}: {f.num(cur.x)}, {f.num(cur.y)} · {t('frame.frameNo', { n: cur.index + 1, total: data.data.frames.length })}
                    </p>
                  )}
                </div>
                <div className="card">
                  <h3>{t('frame.problems', { count: problems.length })}</h3>
                  <ul className="problem-list">
                    {problems.slice(0, 300).map((n) => (
                      <li key={n.index}>
                        <button type="button" className={`problem j${n.judgement}${focus?.index === n.index ? ' active' : ''}`} onClick={() => { setPlaying(false); seek(n.time - 500); }}>
                          <span className="mono">{formatTime(n.time)}</span>
                          <b>{n.judgement === 0 ? '✕' : n.judgement}</b>
                          <span className="muted small">
                            {n.judgement === 0 ? t(`frame.miss.${n.missKind}`) : `${f.signed(n.errorMs ?? 0, 0)} ms · ${n.key ?? ''}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
