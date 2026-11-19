import {
  aimFromBeatmap,
  beatLengthAt,
  circleRadius,
  generateAim,
  hitWindows,
  judgeAim,
  parseBeatmap,
  preemptMs,
  type AimNote,
  type AimOptions,
  type AimPattern,
  type AimResult,
  type AimTap,
  type DrillNote,
  type MapJumpSection
} from '@osu-trainer/analyzer';
import FpsCounter from '../components/FpsCounter.tsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DrillRecord, LibraryMap } from '../../../shared/api.ts';
import Stat from '../components/Stat.tsx';
import TrendChart from '../components/TrendChart.tsx';
import { DrillSession, keyLabel } from '../drill/engine.ts';
import { makeFormatters } from '../format.ts';
import { useSettings } from './RhythmScreen.tsx';

const STATE_KEY = 'osu-trainer.aim';
const COMBO_COLORS = ['#ffc000', '#00ca00', '#127cff', '#f21839'];

interface State extends AimOptions {
  ar: number;
  /** generator kształtów albo skoki z prawdziwej mapy */
  source: 'shape' | 'map';
  mapMd5: string | null;
  /** tempo mapy: 1 = jak w mapie, 1,5 = jak DT */
  mapRate: number;
  /** od jakiej odległości (średnice) przejście w mapie liczy się jako skok */
  mapMinDistance: number;
}

const PATTERNS: AimPattern[] = ['backforth', 'triangles', 'star', 'square', 'polygon', 'oibon', 'flow', 'random'];

const DEFAULTS: State = {
  pattern: 'backforth',
  distance: 3,
  bpm: 150,
  divisor: 2,
  notes: 64,
  cs: 4,
  sides: 3,
  angles: 'mixed',
  ar: 9,
  seed: 1,
  source: 'shape',
  mapMd5: null,
  mapRate: 1,
  mapMinDistance: 1.5
};

interface LoadedMap {
  md5: string;
  title: string;
  notes: AimNote[];
  sections: MapJumpSection[];
  cs: number;
  bpm: number;
}

function loadState(): State {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

/** Przeliczenie pozycji wskaźnika na osu!piksele dla planszy narysowanej w canvasie. */
function layout(width: number, height: number, r: number) {
  const padX = r + 30;
  const padY = r + 20;
  const scale = Math.min(width / (512 + padX * 2), height / (384 + padY * 2));
  return { scale, ox: (width - 512 * scale) / 2, oy: (height - 384 * scale) / 2 };
}

export default function AimScreen({ mapMd5, onMapUsed }: { mapMd5?: string | null; onMapUsed?: () => void }) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const { settings } = useSettings();
  const [st, setSt] = useState<State>(loadState);
  const [session, setSession] = useState<DrillSession | null>(null);
  const [result, setResult] = useState<AimResult | null>(null);
  const [history, setHistory] = useState<DrillRecord[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<{ t: number; x: number; y: number }[]>([]);
  const taps = useRef<AimTap[]>([]);
  const notesRef = useRef<AimNote[]>([]);
  const od = settings?.drillOd ?? 8;
  const [loaded, setLoaded] = useState<LoadedMap | null>(null);
  const [mapError, setMapError] = useState(false);
  const fromMap = st.source === 'map';
  const name = fromMap ? `aim-map-${(st.mapMd5 ?? '').slice(0, 10)}-${st.mapRate}` : `aim-${st.pattern}-${st.distance}d`;

  // mapa przekazana z Biblioteki map
  useEffect(() => {
    if (!mapMd5) return;
    onMapUsed?.();
    setSt((s) => ({ ...s, source: 'map', mapMd5 }));
  }, [mapMd5, onMapUsed]);

  // wycięcie skoków z wybranej mapy (tempo, próg odległości i limit nut z ustawień)
  useEffect(() => {
    if (!fromMap || !st.mapMd5) {
      setLoaded(null);
      return;
    }
    let alive = true;
    const md5 = st.mapMd5;
    void window.api.libraryMapText(md5).then((r) => {
      if (!alive) return;
      if (!r) {
        setMapError(true);
        setLoaded(null);
        return;
      }
      setMapError(false);
      const bm = parseBeatmap(r.text);
      const cut = aimFromBeatmap(bm, { rate: st.mapRate, minDistance: st.mapMinDistance, maxNotes: st.notes });
      const firstAt = cut.sections[0]?.startMs ?? 0;
      setLoaded({
        md5,
        title: `${bm.metadata.artist} – ${bm.metadata.title} [${bm.metadata.version}]`,
        notes: cut.notes,
        sections: cut.sections,
        cs: cut.cs,
        bpm: Math.round((60000 / beatLengthAt(bm, firstAt)) * st.mapRate)
      });
    });
    return () => {
      alive = false;
    };
  }, [fromMap, st.mapMd5, st.mapRate, st.mapMinDistance, st.notes]);

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(st));
    } catch {
      // brak pamięci – trudno
    }
  }, [st]);

  const loadHistory = useCallback(() => void window.api.listDrills('aim', name, 200).then(setHistory), [name]);
  useEffect(loadHistory, [loadHistory]);

  const generated = useMemo(() => generateAim(st), [st]);
  const notes = fromMap ? (loaded?.notes ?? []) : generated;
  // z mapy: CS i tempo mapy; generator: z ustawień
  const cs = fromMap && loaded ? loaded.cs : st.cs;
  const bpm = fromMap && loaded ? loaded.bpm : st.bpm;
  const r = circleRadius(cs);
  const preempt = preemptMs(st.ar);

  const positionAt = (time: number) => {
    const buf = pointer.current;
    for (let i = buf.length - 1; i >= 0; i--) if (buf[i]!.t <= time) return buf[i]!;
    return buf[0] ?? { t: time, x: 256, y: 192 };
  };

  const start = async () => {
    if (!settings) return;
    session?.stop(false);
    setResult(null);
    taps.current = [];
    pointer.current = [];
    notesRef.current = notes;
    const drillNotes: DrillNote[] = notes.map((n, i) => ({ time: n.time, finger: null, group: 0, position: i + 1 }));
    const s = new DrillSession({
      notes: drillNotes,
      bpm,
      // z mapy nie ma stałego tempa – klik na każdą nutę zastępuje muzykę
      clickMode: fromMap ? 'notes' : 'beats',
      volume: settings.volume,
      offsetMs: settings.audioOffsetMs,
      keyK1: settings.keyK1,
      keyK2: settings.keyK2,
      countInBeats: 4,
      onTap: (tap) => {
        const p = positionAt(tap.time);
        taps.current.push({ time: tap.time, x: p.x, y: p.y });
      },
      onEnd: (_t, finished) => {
        const until = finished ? Infinity : s.nowMs();
        const played = notesRef.current.filter((n) => n.time <= until);
        const res = judgeAim(played, taps.current, od, cs);
        setResult(res);
        setSession(null);
        if (played.length >= 20) {
          void window.api
            .saveDrill({
              kind: 'aim',
              name,
              label: fromMap && loaded ? `${loaded.title} · ${st.mapRate}×` : t(`aim.pattern.${st.pattern}`) + ` · ${st.distance}× · ${st.bpm} BPM`,
              bpm,
              durationMs: played[played.length - 1]!.time,
              notes: played.length,
              accuracy: res.accuracy,
              misses: res.aimMisses + res.timingMisses,
              extraTaps: 0,
              wrongFinger: 0,
              ur: res.timing.ur,
              mean: res.timing.mean,
              k1Mean: 0,
              k2Mean: 0,
              k1Ur: 0,
              k2Ur: 0,
              entryMean: 0,
              tapSpread: 0,
              aimDistance: res.meanDistance,
              aimOvershoot: res.overshoot,
              hitRate: res.hitRate
            })
            .then(loadHistory);
        }
      }
    });
    setSession(s);
    await s.start();
  };

  // rysowanie planszy
  useEffect(() => {
    if (!session) return;
    let raf = 0;
    const w = hitWindows(od);
    const frame = () => {
      const c = canvas.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      if (c.width !== Math.round(rect.width * dpr)) {
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const { scale, ox, oy } = layout(rect.width, rect.height, r);
      const X = (x: number) => ox + x * scale;
      const Y = (y: number) => oy + y * scale;
      ctx.strokeStyle = '#2a2c31';
      ctx.strokeRect(ox, oy, 512 * scale, 384 * scale);
      const now = session.nowMs();
      if (now < 0) {
        ctx.fillStyle = '#d4d6db';
        ctx.font = '700 32px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.ceil(-now / session.beatMs)), rect.width / 2, rect.height / 2);
      }
      const all = notesRef.current;
      // linia do następnej nuty – jak „follow point” w osu!
      for (let i = all.length - 1; i >= 0; i--) {
        const n = all[i]!;
        if (n.time - preempt > now || n.time + w.meh < now) continue;
        const prev = all[i - 1];
        if (prev && prev.time + w.meh >= now) {
          ctx.strokeStyle = 'rgba(241,242,244,0.18)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(X(prev.x), Y(prev.y));
          ctx.lineTo(X(n.x), Y(n.y));
          ctx.stroke();
        }
        const alpha = Math.min(1, (now - (n.time - preempt)) / Math.min(400, preempt * 0.66));
        ctx.globalAlpha = alpha;
        const color = COMBO_COLORS[Math.floor(i / 8) % COMBO_COLORS.length]!;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(X(n.x), Y(n.y), r * scale * 0.92, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f1f2f4';
        ctx.lineWidth = Math.max(2, r * scale * 0.1);
        ctx.stroke();
        ctx.fillStyle = '#0f1012';
        ctx.font = `700 ${Math.round(r * scale * 0.8)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n.combo), X(n.x), Y(n.y) + 1);
        if (now < n.time) {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(2, r * scale * 0.08);
          ctx.beginPath();
          ctx.arc(X(n.x), Y(n.y), r * scale * (1 + 3 * ((n.time - now) / preempt)), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // miejsca ostatnich kliknięć
      for (const tap of taps.current.slice(-6)) {
        const age = (now - tap.time) / 600;
        if (age > 1 || age < 0) continue;
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = '#c9b8ff';
        ctx.beginPath();
        ctx.arc(X(tap.x), Y(tap.y), 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!session.isStopped) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [session, od, r, preempt]);

  const toOsu = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { scale, ox, oy } = layout(rect.width, rect.height, r);
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!session) return;
    const events = (e.nativeEvent.getCoalescedEvents?.() ?? []).length ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    const { scale, ox, oy } = layout(rect.width, rect.height, r);
    for (const ev of events) {
      pointer.current.push({ t: session.toDrillMs(ev.timeStamp), x: (ev.clientX - rect.left - ox) / scale, y: (ev.clientY - rect.top - oy) / scale });
    }
    if (pointer.current.length > 4000) pointer.current.splice(0, 2000);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!session) return;
    e.preventDefault();
    const p = toOsu(e);
    pointer.current.push({ t: session.toDrillMs(e.timeStamp), ...p });
    const tap = session.externalTap(e.button === 2 ? 'K2' : 'K1', e.timeStamp);
    // pozycja z tego samego zdarzenia (onTap dopisał już pozycję z bufora – poprawiamy na dokładną)
    if (tap && taps.current.length) taps.current[taps.current.length - 1] = { time: tap.time, ...p };
  };

  const set = (patch: Partial<State>) => setSt((s) => ({ ...s, ...patch }));
  const running = session !== null;
  const asc = [...history].reverse();
  const fmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const pts = (pick: (d: DrillRecord) => number | null | undefined) =>
    asc.filter((d) => pick(d) != null).map((d) => ({ id: d.id, label: fmt.format(new Date(d.createdAt)), tip: d.label, value: pick(d)! }));

  return (
    <div className="screen aim">
      <header className="screen-head">
        <h1>{t('aim.title')}</h1>
        <p className="muted">{t('aim.subtitle', { k1: keyLabel(settings?.keyK1 ?? 'KeyZ'), k2: keyLabel(settings?.keyK2 ?? 'KeyX') })}</p>
      </header>

      <div className="card drill-controls">
        <div className="segmented" role="tablist">
          <button type="button" disabled={running} className={!fromMap ? 'on' : ''} onClick={() => set({ source: 'shape' })}>
            {t('aim.sourceShape')}
          </button>
          <button type="button" disabled={running} className={fromMap ? 'on' : ''} onClick={() => set({ source: 'map' })}>
            {t('aim.sourceMap')}
          </button>
        </div>

        {!fromMap ? (
          <div className="aim-patterns">
            <div className="chips">
              {PATTERNS.map((m) => (
                <button key={m} type="button" disabled={running} className={`chip lib-chip${st.pattern === m ? ' on' : ''}`} onClick={() => set({ pattern: m })}>
                  {t(`aim.pattern.${m}`)}
                </button>
              ))}
            </div>
            <p className="muted small">{t(`aim.patternHint.${st.pattern}`)}</p>
          </div>
        ) : (
          <MapPicker selected={st.mapMd5} loaded={loaded} error={mapError} disabled={running} onPick={(md5) => set({ mapMd5: md5 })} />
        )}

        <div className="controls-row">
          {!fromMap && (
            <>
              <label className="field">
                <span>{t('aim.distance')}</span>
                <select value={st.distance} disabled={running} onChange={(e) => set({ distance: Number(e.target.value) })}>
                  {[1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {f.num(d, d % 1 ? 1 : 0)}×
                    </option>
                  ))}
                </select>
              </label>
              {st.pattern === 'polygon' && (
                <label className="field">
                  <span>{t('aim.sides')}</span>
                  <select value={st.sides} disabled={running} onChange={(e) => set({ sides: Number(e.target.value) })}>
                    {[3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {st.pattern === 'random' && (
                <label className="field">
                  <span>{t('aim.angles')}</span>
                  <select value={st.angles} disabled={running} onChange={(e) => set({ angles: e.target.value as State['angles'] })}>
                    {(['mixed', 'sharp', 'wide'] as const).map((a) => (
                      <option key={a} value={a}>
                        {t(`aim.angle.${a}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span>BPM</span>
                <input type="number" min={60} max={300} step={5} value={st.bpm} disabled={running} onChange={(e) => set({ bpm: Math.max(60, Math.min(300, Number(e.target.value) || 60)) })} />
              </label>
              <label className="field">
                <span>{t('aim.rhythm')}</span>
                <select value={st.divisor} disabled={running} onChange={(e) => set({ divisor: Number(e.target.value) })}>
                  <option value={1}>1/1</option>
                  <option value={2}>1/2</option>
                </select>
              </label>
              <label className="field">
                <span>CS</span>
                <input type="number" min={2} max={7} step={0.1} value={st.cs} disabled={running} onChange={(e) => set({ cs: Math.max(2, Math.min(7, Number(e.target.value) || 4)) })} />
              </label>
            </>
          )}
          {fromMap && (
            <>
              <label className="field">
                <span>{t('aim.mapRate')}</span>
                <select value={st.mapRate} disabled={running} onChange={(e) => set({ mapRate: Number(e.target.value) })}>
                  {[0.5, 0.6, 0.75, 0.85, 1, 1.15, 1.3, 1.5].map((v) => (
                    <option key={v} value={v}>
                      {f.num(v, 2)}×{v === 1.5 ? ' (DT)' : v === 0.75 ? ' (HT)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('aim.mapMinDistance')}</span>
                <select value={st.mapMinDistance} disabled={running} onChange={(e) => set({ mapMinDistance: Number(e.target.value) })}>
                  {[1, 1.5, 2, 2.5, 3].map((v) => (
                    <option key={v} value={v}>
                      {f.num(v, 1)}×
                    </option>
                  ))}
                </select>
              </label>
              {loaded && (
                <div className="field">
                  <span>CS · BPM</span>
                  <strong className="aim-mapcs">
                    {f.num(loaded.cs, 1)} · {loaded.bpm}
                  </strong>
                </div>
              )}
            </>
          )}
          <label className="field">
            <span>AR</span>
            <input type="number" min={5} max={10.3} step={0.1} value={st.ar} disabled={running} onChange={(e) => set({ ar: Math.max(5, Math.min(10.3, Number(e.target.value) || 9)) })} />
          </label>
          <label className="field">
            <span>{fromMap ? t('aim.maxNotes') : t('aim.count')}</span>
            <select value={st.notes} disabled={running} onChange={(e) => set({ notes: Number(e.target.value) })}>
              {[32, 64, 128, 256].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {running ? (
            <button type="button" className="btn" onClick={() => session?.stop(false)}>
              {t('drill.stop')}
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={!settings || notes.length < 2} onClick={() => void start()}>
              {t('drill.start')}
            </button>
          )}
          {!running && !fromMap && (st.pattern === 'random' || st.pattern === 'triangles' || st.pattern === 'star' || st.pattern === 'oibon' || st.pattern === 'flow') && (
            <button type="button" className="btn small ghost" onClick={() => set({ seed: (st.seed ?? 1) + 1 })}>
              {t('aim.reshuffle')}
            </button>
          )}
        </div>
        <p className="muted small">{t('aim.hint')}</p>
      </div>

      {running && (
        <div className="aim-overlay">
          <div className="aim-bar">
            <span className="muted small">{t('drill.runningHint', { k1: keyLabel(settings?.keyK1 ?? ''), k2: keyLabel(settings?.keyK2 ?? '') })}</span>
            {settings?.showFps && <FpsCounter className="inline" />}
            <button type="button" className="btn small" onClick={() => session?.stop(false)}>
              {t('drill.stop')}
            </button>
          </div>
          <canvas
            ref={canvas}
            className="aim-field"
            onPointerMove={onMove}
            onPointerDown={onDown}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      )}

      {result && !running && (
        <div className="drill-results">
          <div className="grid">
            <Stat label={t('aim.hitRate')} value={`${f.num(result.hitRate, 1)}%`} hint={t('aim.missSplit', { aim: result.aimMisses, timing: result.timingMisses })} />
            <Stat label={t('replay.progress.accuracy')} value={`${f.num(result.accuracy, 2)}%`} />
            <Stat label="UR" value={f.num(result.timing.ur)} hint={`${t('replay.meanError')}: ${f.signed(result.timing.mean)} ms`} />
            <Stat label={t('replay.aimDistance')} value={`${f.num(result.meanDistance * 100)}%`} hint={t('replay.aimDistanceHint')} />
            <Stat label={t('replay.overshoot')} value={`${f.signed(result.overshoot * 100, 0)}%`} hint={t('aim.overshootHint')} />
            <Stat label={t('aim.sideways')} value={`${f.num(result.sideways * 100)}%`} hint={t('aim.sidewaysHint')} />
            {result.byAngle.sharp !== null && result.byAngle.wide !== null && (
              <Stat
                label={t('aim.byAngle')}
                value={`${f.num(result.byAngle.sharp * 100)}% / ${f.num(result.byAngle.wide * 100)}%`}
                hint={t('aim.byAngleHint')}
              />
            )}
          </div>
          <div className="card chart-card">
            <h3>{t('aim.scatter')}</h3>
            <p className="muted small">{t('aim.scatterHint')}</p>
            <Scatter result={result} />
          </div>
        </div>
      )}

      <h2>{t('drill.history')}</h2>
      {history.length === 0 ? (
        <p className="muted small">{t('drill.noHistory')}</p>
      ) : (
        <div className="trend-grid">
          <TrendChart title={t('aim.hitRate')} betterHint={t('replay.progress.higherBetter')} points={pts((d) => d.hitRate)} format={(v) => `${f.num(v, 0)}%`} />
          <TrendChart title={t('replay.aimDistance')} betterHint={t('replay.progress.lowerBetter')} points={pts((d) => (d.aimDistance ?? 0) * 100)} format={(v) => `${f.num(v)}%`} />
          <TrendChart title={t('replay.overshoot')} betterHint={t('replay.progress.closerZero')} points={pts((d) => (d.aimOvershoot ?? 0) * 100)} format={(v) => `${f.signed(v, 0)}%`} zeroLine />
        </div>
      )}
    </div>
  );
}

/** Rozrzut kliknięć względem środka nuty, obrócony tak, że skok zawsze idzie w prawo. */
function Scatter({ result }: { result: AimResult }) {
  const pts = result.notes.filter((n) => n.along !== null && n.across !== null);
  const R = 2.2; // zakres wykresu w promieniach
  const S = 260;
  const toPx = (v: number) => S / 2 + (v / R) * (S / 2);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="scatter" role="img">
      <circle cx={S / 2} cy={S / 2} r={(1 / R) * (S / 2)} fill="rgba(255,255,255,0.04)" stroke="#4a4d55" />
      <line x1={0} y1={S / 2} x2={S} y2={S / 2} stroke="#2a2c31" />
      <line x1={S / 2} y1={0} x2={S / 2} y2={S} stroke="#2a2c31" />
      <text x={S - 6} y={S / 2 - 6} textAnchor="end" fill="#8b8f98" fontSize="10">
        →
      </text>
      {pts.map((n, i) => (
        <circle
          key={i}
          cx={toPx(Math.max(-R, Math.min(R, n.along!)))}
          cy={toPx(Math.max(-R, Math.min(R, n.across!)))}
          r={3.2}
          fill={n.judgement === 0 ? '#ff5a5a' : '#8c7ae6'}
          opacity={0.75}
        >
          <title>{`${n.along!.toFixed(2)} / ${n.across!.toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Wybór mapy z Biblioteki map: wyszukiwanie (też po maperze), mapy z największą liczbą skoków na górze. */
function MapPicker({
  selected,
  loaded,
  error,
  disabled,
  onPick
}: {
  selected: string | null;
  loaded: LoadedMap | null;
  error: boolean;
  disabled: boolean;
  onPick: (md5: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<LibraryMap[]>([]);
  useEffect(() => {
    const id = setTimeout(() => {
      void window.api.queryLibrary({ search, jumpsPerMin: [3, null], sort: 'jumps', desc: true, limit: 8 }).then((r) => setItems(r.items));
    }, 200);
    return () => clearTimeout(id);
  }, [search]);
  const avg = loaded && loaded.sections.length ? loaded.sections.reduce((a, s) => a + s.distance * s.notes, 0) / loaded.sections.reduce((a, s) => a + s.notes, 0) : 0;
  return (
    <div className="aim-map-picker">
      <input className="search" type="search" placeholder={t('aim.mapSearch')} value={search} disabled={disabled} onChange={(e) => setSearch(e.target.value)} />
      <p className="muted small">{t('aim.mapHint')}</p>
      {items.length === 0 ? (
        <p className="muted small">{t('aim.mapNone')}</p>
      ) : (
        <ul className="aim-map-list">
          {items.map((m) => (
            <li key={m.md5}>
              <button type="button" disabled={disabled} className={selected === m.md5 ? 'on' : ''} onClick={() => onPick(m.md5)}>
                <span className="lib-title">
                  {m.artist} – {m.title} <span className="muted">[{m.version}]</span>
                </span>
                <span className="muted small">
                  {m.creator} · {t('library.m.jumpsPerMin', { value: f.num(m.jumpsPerMin, 1) })} · {t('library.m.jumpDistance', { value: f.num(m.jumpDistance, 2) })}
                  {m.stars !== null ? ` · ★ ${f.num(m.stars, 2)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="warn-text small">{t('aim.mapMissing')}</p>}
      {loaded && (
        <p className="small aim-map-summary">
          <strong>{loaded.title}</strong>
          <br />
          {loaded.notes.length >= 2
            ? t('aim.mapCut', { sections: loaded.sections.length, notes: loaded.notes.length, dist: f.num(avg, 2) })
            : t('aim.mapNoJumps')}
        </p>
      )}
    </div>
  );
}
