import { burstLadder, errorStats, mapStreamNotes, parseBeatmap, streamNotes, type Beatmap, type DrillNote, type Finger } from '@osu-trainer/analyzer';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DrillHistory, DrillResults } from '../drill/DrillResults.tsx';
import { keyLabel, type ClickMode } from '../drill/engine.ts';
import Lane from '../drill/Lane.tsx';
import { useDrill } from '../drill/useDrill.ts';
import { makeFormatters } from '../format.ts';
import { useSettings } from './RhythmScreen.tsx';
import type { Recommendation } from '../../../shared/api.ts';

type Mode = 'ladder' | 'stream' | 'map';
const STATE_KEY = 'osu-trainer.trainer';

interface State {
  mode: Mode;
  ladder: { length: number; startBpm: number; bpmStep: number; stepEvery: number; bursts: number; startFinger: Finger };
  stream: { bpm: number; seconds: number };
  map: { rate: number; minNotes: number };
  click: ClickMode;
}

const DEFAULTS: State = {
  mode: 'ladder',
  ladder: { length: 7, startBpm: 170, bpmStep: 5, stepEvery: 3, bursts: 18, startFinger: 'K1' },
  stream: { bpm: 170, seconds: 30 },
  map: { rate: 1, minNotes: 5 },
  click: 'beats'
};

function loadState(): State {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}');
    return { ...DEFAULTS, ...s, ladder: { ...DEFAULTS.ladder, ...s.ladder }, stream: { ...DEFAULTS.stream, ...s.stream }, map: { ...DEFAULTS.map, ...s.map } };
  } catch {
    return DEFAULTS;
  }
}

function Num({ label, value, onChange, min, max, step = 1, disabled }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; disabled?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
    </label>
  );
}

export default function TrainerScreen({
  preset,
  onPresetUsed,
  mapMd5,
  onMapUsed
}: {
  preset?: Recommendation | null;
  onPresetUsed?: () => void;
  /** mapa z Biblioteki map – od razu tryb „streamy z mapy” */
  mapMd5?: string | null;
  onMapUsed?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const { settings, update } = useSettings();
  const drill = useDrill(settings);
  const [st, setSt] = useState<State>(loadState);
  const [map, setMap] = useState<{ file: string; beatmap: Beatmap } | null>(null);
  const running = drill.running;

  // ustawienia z podpowiedzi na Pulpicie
  useEffect(() => {
    if (!preset?.mode) return;
    setSt((s) =>
      preset.mode === 'ladder'
        ? { ...s, mode: 'ladder', ladder: { ...s.ladder, startBpm: preset.bpm, length: preset.length ?? s.ladder.length } }
        : { ...s, mode: 'stream', stream: { bpm: preset.bpm, seconds: preset.seconds ?? s.stream.seconds } }
    );
    onPresetUsed?.();
  }, [preset, onPresetUsed]);

  useEffect(() => {
    if (!mapMd5) return;
    onMapUsed?.();
    void window.api.libraryMapText(mapMd5).then((r) => {
      if (!r) return;
      setMap({ file: r.file, beatmap: parseBeatmap(r.text) });
      setSt((s) => ({ ...s, mode: 'map' }));
    });
  }, [mapMd5, onMapUsed]);

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(st));
    } catch {
      // brak pamięci – trudno
    }
  }, [st]);

  // sekwencja dla wybranego trybu (podgląd liczby nut i czasu przed startem)
  const plan = useMemo((): { notes: DrillNote[]; bpm: number; bpmByGroup?: number[]; name: string; label: string } | null => {
    if (st.mode === 'ladder') {
      const l = st.ladder;
      const r = burstLadder({ ...l, gapBeats: 2 });
      return { notes: r.notes, bpm: l.startBpm, bpmByGroup: r.bpmByGroup, name: `ladder-${l.length}`, label: t('trainer.ladderLabel', { length: l.length, from: l.startBpm, to: r.bpmByGroup.at(-1) }) };
    }
    if (st.mode === 'stream') {
      return { notes: streamNotes(st.stream.bpm, st.stream.seconds * 1000), bpm: st.stream.bpm, name: `stream-${st.stream.seconds}`, label: t('trainer.streamLabel', { bpm: st.stream.bpm, seconds: st.stream.seconds }) };
    }
    if (!map) return null;
    const r = mapStreamNotes(map.beatmap, { rate: st.map.rate, minNotes: st.map.minNotes, gapMs: 1200 });
    const md = map.beatmap.metadata;
    return { notes: r.notes, bpm: r.bpm || 120, name: `map:${md.beatmapId ?? md.title}:${md.version}`, label: `${md.title} [${md.version}] · ${Math.round(st.map.rate * 100)}%` };
  }, [st, map, t]);

  const start = () => {
    if (!plan || plan.notes.length === 0) return;
    void drill.start({
      notes: plan.notes,
      bpm: plan.bpm,
      clickMode: st.mode === 'map' && st.click === 'beats' ? 'notes' : st.click,
      meta: { kind: 'trainer', name: plan.name, label: plan.label, bpm: plan.bpm }
    });
  };

  const pickMap = async () => {
    const r = await window.api.pickMapText({ pickMap: t('trainer.pickMap') });
    if (r) setMap({ file: r.file, beatmap: parseBeatmap(r.text) });
  };

  // drabinka: wynik osobno dla każdego tempa
  const perBpm = useMemo(() => {
    if (!drill.result || !plan?.bpmByGroup) return [];
    const by = new Map<number, typeof drill.result.notes>();
    for (const n of drill.result.notes) {
      const bpm = plan.bpmByGroup[n.group]!;
      by.set(bpm, [...(by.get(bpm) ?? []), n]);
    }
    return [...by.entries()].map(([bpm, list]) => {
      const e = errorStats(list.filter((n) => n.errorMs !== null).map((n) => n.errorMs!));
      const entry = errorStats(list.filter((n) => n.position === 1 && n.errorMs !== null).map((n) => n.errorMs!));
      return { bpm, ur: e.ur, mean: e.mean, entry: entry.mean, misses: list.filter((n) => n.judgement === 0).length };
    });
  }, [drill.result, plan]);

  const setL = (patch: Partial<State['ladder']>) => setSt((s) => ({ ...s, ladder: { ...s.ladder, ...patch } }));
  const totalSec = plan?.notes.length ? Math.round(plan.notes[plan.notes.length - 1]!.time / 1000) : 0;

  return (
    <div className="screen trainer">
      <header className="screen-head">
        <h1>{t('trainer.title')}</h1>
        <p className="muted">{t('trainer.subtitle', { k1: keyLabel(settings?.keyK1 ?? 'KeyZ'), k2: keyLabel(settings?.keyK2 ?? 'KeyX') })}</p>
      </header>

      <div className="card drill-controls">
        <div className="segmented" role="tablist">
          {(['ladder', 'stream', 'map'] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" disabled={running} aria-selected={st.mode === m} className={st.mode === m ? 'on' : ''} onClick={() => setSt((s) => ({ ...s, mode: m }))}>
              {t(`trainer.mode.${m}`)}
            </button>
          ))}
        </div>
        <p className="muted small">{t(`trainer.modeHint.${st.mode}`)}</p>

        <div className="controls-row">
          {st.mode === 'ladder' && (
            <>
              <label className="field">
                <span>{t('trainer.burstLength')}</span>
                <select value={st.ladder.length} disabled={running} onChange={(e) => setL({ length: Number(e.target.value) })}>
                  {[3, 5, 7, 9, 13, 17].map((n) => (
                    <option key={n} value={n}>
                      {t('trainer.notes', { count: n })}
                    </option>
                  ))}
                </select>
              </label>
              <Num label={t('trainer.startBpm')} value={st.ladder.startBpm} min={80} max={320} step={5} disabled={running} onChange={(v) => setL({ startBpm: v })} />
              <Num label={t('trainer.bpmStep')} value={st.ladder.bpmStep} min={0} max={30} disabled={running} onChange={(v) => setL({ bpmStep: v })} />
              <Num label={t('trainer.stepEvery')} value={st.ladder.stepEvery} min={1} max={20} disabled={running} onChange={(v) => setL({ stepEvery: v })} />
              <Num label={t('trainer.bursts')} value={st.ladder.bursts} min={3} max={120} disabled={running} onChange={(v) => setL({ bursts: v })} />
              <label className="field">
                <span>{t('trainer.startFinger')}</span>
                <select value={st.ladder.startFinger} disabled={running} onChange={(e) => setL({ startFinger: e.target.value as Finger })}>
                  <option value="K1">K1 (L)</option>
                  <option value="K2">K2 (P)</option>
                </select>
              </label>
            </>
          )}
          {st.mode === 'stream' && (
            <>
              <Num label="BPM" value={st.stream.bpm} min={80} max={320} step={5} disabled={running} onChange={(v) => setSt((s) => ({ ...s, stream: { ...s.stream, bpm: v } }))} />
              <label className="field">
                <span>{t('rhythm.duration')}</span>
                <span className="segmented">
                  {[15, 30, 60, 120].map((sec) => (
                    <button key={sec} type="button" disabled={running} className={st.stream.seconds === sec ? 'on' : ''} onClick={() => setSt((s) => ({ ...s, stream: { ...s.stream, seconds: sec } }))}>
                      {sec} s
                    </button>
                  ))}
                </span>
              </label>
            </>
          )}
          {st.mode === 'map' && (
            <>
              <div className="field">
                <span>{t('trainer.map')}</span>
                <button type="button" className="btn small" disabled={running} onClick={() => void pickMap()}>
                  {map ? `${map.beatmap.metadata.title} [${map.beatmap.metadata.version}]` : t('trainer.pickMap')}
                </button>
              </div>
              <label className="field">
                <span>{t('trainer.rate')}</span>
                <select value={st.map.rate} disabled={running} onChange={(e) => setSt((s) => ({ ...s, map: { ...s.map, rate: Number(e.target.value) } }))}>
                  {[0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.3, 1.5].map((r) => (
                    <option key={r} value={r}>
                      {Math.round(r * 100)}%
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('trainer.minNotes')}</span>
                <select value={st.map.minNotes} disabled={running} onChange={(e) => setSt((s) => ({ ...s, map: { ...s.map, minNotes: Number(e.target.value) } }))}>
                  {[5, 9, 17, 33].map((n) => (
                    <option key={n} value={n}>
                      {t('trainer.notesPlus', { count: n })}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="field">
            <span>{t('rhythm.click')}</span>
            <select value={st.click} disabled={running} onChange={(e) => setSt((s) => ({ ...s, click: e.target.value as ClickMode }))}>
              <option value="beats">{st.mode === 'map' ? t('rhythm.clickNotes') : t('rhythm.clickBeats')}</option>
              {st.mode !== 'map' && <option value="notes">{t('rhythm.clickNotes')}</option>}
              <option value="off">{t('rhythm.clickOff')}</option>
            </select>
          </label>
          <label className="field">
            <span>OD</span>
            <select value={settings?.drillOd ?? 8} disabled={running} onChange={(e) => void update({ drillOd: Number(e.target.value) })}>
              {[5, 6, 7, 8, 9, 10].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          {running ? (
            <button type="button" className="btn" onClick={drill.stop}>
              {t('drill.stop')}
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={!plan || plan.notes.length === 0 || !settings} onClick={start}>
              {t('drill.start')}
            </button>
          )}
        </div>
        {plan && <p className="muted small">{t('trainer.plan', { notes: plan.notes.length, seconds: totalSec })}</p>}
        {st.mode === 'map' && map && plan?.notes.length === 0 && <p className="warn-text small">{t('trainer.noStreams')}</p>}
      </div>

      {drill.session && (
        <div className="card lane-card big">
          <Lane session={drill.session} notes={drill.notes} od={settings?.drillOd ?? 8} />
          <p className="muted small">{t('drill.runningHint', { k1: keyLabel(settings?.keyK1 ?? ''), k2: keyLabel(settings?.keyK2 ?? '') })}</p>
        </div>
      )}

      {drill.result && !running && (
        <DrillResults r={drill.result} od={settings?.drillOd ?? 8} f={f}>
          {perBpm.length > 1 && (
            <div className="card chart-card">
              <h3>{t('trainer.perBpm')}</h3>
              <div className="bpm-table">
                <div className="bpm-row head trainer-row">
                  <span>BPM</span>
                  <span>UR</span>
                  <span>{t('replay.meanError')}</span>
                  <span>{t('replay.entry')}</span>
                  <span>{t('trainer.misses')}</span>
                </div>
                {perBpm.map((b) => (
                  <div key={b.bpm} className="bpm-row trainer-row">
                    <b>{b.bpm}</b>
                    <span>{f.num(b.ur)}</span>
                    <span>{f.signed(b.mean)} ms</span>
                    <span>{f.signed(b.entry)} ms</span>
                    <span>{b.misses}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DrillResults>
      )}

      {plan && (
        <>
          <h2>{t('drill.history')}</h2>
          <DrillHistory kind="trainer" name={plan.name} refresh={drill.saved} f={f} />
        </>
      )}
    </div>
  );
}
