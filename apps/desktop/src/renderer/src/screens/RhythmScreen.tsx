import { parsePattern, patternNotes } from '@osu-trainer/analyzer';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '../../../shared/api.ts';
import { DrillHistory, DrillResults } from '../drill/DrillResults.tsx';
import { keyLabel, type ClickMode } from '../drill/engine.ts';
import Lane from '../drill/Lane.tsx';
import { EXERCISES, type Exercise } from '../drill/patterns.ts';
import { useDrill } from '../drill/useDrill.ts';
import { makeFormatters } from '../format.ts';

const STATE_KEY = 'osu-trainer.rhythm';
const CALIBRATION_BEATS = 32;
const CALIBRATION_BPM = 100;

function loadState(): { id: string; bpm: Record<string, number>; seconds: number; click: ClickMode } {
  try {
    return { id: 'single', bpm: {}, seconds: 60, click: 'beats', ...JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') };
  } catch {
    return { id: 'single', bpm: {}, seconds: 60, click: 'beats' };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void window.api.getSettings().then((s) => setSettings(s.settings));
  }, []);
  const update = async (patch: Partial<Settings>) => setSettings((await window.api.updateSettings(patch)).settings);
  return { settings, update };
}

export function PatternChips({ pattern, active }: { pattern: string; active?: number }) {
  return (
    <span className="pattern">
      {parsePattern(pattern).map((s, i) => (
        <span key={i} className={`pchip ${s ? (s.finger === 'K1' ? 'k1' : s.finger === 'K2' ? 'k2' : 'any') : 'rest'}${s?.accent ? ' accent' : ''}${active === i ? ' on' : ''}`}>
          {s ? (s.finger === 'K1' ? 'L' : s.finger === 'K2' ? 'P' : '•') : '·'}
        </span>
      ))}
    </span>
  );
}

export default function RhythmScreen() {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const { settings, update } = useSettings();
  const drill = useDrill(settings);
  const calib = useDrill(settings);
  const [st, setSt] = useState(loadState);
  const ex = EXERCISES.find((e) => e.id === st.id) ?? EXERCISES[0]!;
  const bpm = st.bpm[ex.id] ?? Math.round((ex.minBpm + ex.maxBpm) / 2);
  const [calibrated, setCalibrated] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(st));
    } catch {
      // brak pamięci – trudno
    }
  }, [st]);

  // wynik kalibracji: mediana błędu (bez pierwszych 4 uderzeń) dopisana do obecnego przesunięcia
  useEffect(() => {
    if (!calib.result || !settings) return;
    const errs = calib.result.notes
      .slice(4)
      .map((n) => n.errorMs)
      .filter((e): e is number => e !== null)
      .sort((a, b) => a - b);
    if (errs.length < 12) return;
    const median = errs[errs.length >> 1]!;
    const next = Math.round(settings.audioOffsetMs + median);
    setCalibrated(next);
    void update({ audioOffsetMs: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calib.result]);

  const setBpm = (v: number) => setSt((s) => ({ ...s, bpm: { ...s.bpm, [ex.id]: Math.max(40, Math.min(320, Math.round(v))) } }));
  const running = drill.running || calib.running;

  const start = (e: Exercise) =>
    void drill.start({
      notes: patternNotes(e.pattern, bpm, st.seconds * 1000, e.stepsPerBeat),
      bpm,
      clickMode: st.click,
      meta: { kind: 'rhythm', name: e.id, label: t(`rhythm.ex.${e.id}.name`), bpm }
    });

  const calibrate = () => {
    setCalibrated(null);
    void calib.start({
      notes: patternNotes('x', CALIBRATION_BPM, (CALIBRATION_BEATS - 1) * (60000 / CALIBRATION_BPM), 1),
      bpm: CALIBRATION_BPM,
      clickMode: 'notes',
      meta: { kind: 'rhythm', name: 'calibration', label: '', bpm: CALIBRATION_BPM },
      noSave: true
    });
  };

  return (
    <div className="screen rhythm">
      <header className="screen-head">
        <h1>{t('rhythm.title')}</h1>
        <p className="muted">{t('rhythm.subtitle', { k1: keyLabel(settings?.keyK1 ?? 'KeyZ'), k2: keyLabel(settings?.keyK2 ?? 'KeyX') })}</p>
      </header>

      <div className="drill-layout">
        <aside className="exercise-list">
          {EXERCISES.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`card exercise${e.id === ex.id ? ' active' : ''}`}
              disabled={running}
              onClick={() => setSt((s) => ({ ...s, id: e.id }))}
            >
              <span className="exercise-name">{t(`rhythm.ex.${e.id}.name`)}</span>
              <PatternChips pattern={e.pattern} />
              <span className="muted small">
                {e.minBpm}–{e.maxBpm} BPM · {t(`rhythm.ex.${e.id}.purpose`)}
              </span>
            </button>
          ))}

          <div className="card calibration">
            <h3>{t('rhythm.calibration.title')}</h3>
            <p className="muted small">{t('rhythm.calibration.hint', { beats: CALIBRATION_BEATS })}</p>
            <div className="row">
              <span>
                {t('rhythm.calibration.current')}: <b>{f.signed(settings?.audioOffsetMs ?? 0, 0)} ms</b>
              </span>
              <button type="button" className="btn small" disabled={running} onClick={calibrate}>
                {t('rhythm.calibration.start')}
              </button>
              {calibrated !== null && (
                <button type="button" className="btn small ghost" onClick={() => void update({ audioOffsetMs: 0 }).then(() => setCalibrated(null))}>
                  {t('rhythm.calibration.reset')}
                </button>
              )}
            </div>
            {calibrated !== null && <p className="good-text small">{t('rhythm.calibration.done', { value: f.signed(calibrated, 0) })}</p>}
          </div>
        </aside>

        <section className="drill-main">
          <div className="card drill-controls">
            <div>
              <h3>{t(`rhythm.ex.${ex.id}.name`)}</h3>
              <PatternChips pattern={ex.pattern} />
              <p className="muted small">{t(`rhythm.ex.${ex.id}.purpose`)}</p>
            </div>
            <div className="controls-row">
              <label className="field">
                <span>BPM</span>
                <span className="stepper">
                  <button type="button" className="btn small" disabled={running} onClick={() => setBpm(bpm - 5)}>
                    −5
                  </button>
                  <input type="number" value={bpm} disabled={running} onChange={(e) => setBpm(Number(e.target.value))} />
                  <button type="button" className="btn small" disabled={running} onClick={() => setBpm(bpm + 5)}>
                    +5
                  </button>
                </span>
              </label>
              <label className="field">
                <span>{t('rhythm.duration')}</span>
                <span className="segmented">
                  {[30, 60, 120].map((s) => (
                    <button key={s} type="button" disabled={running} className={st.seconds === s ? 'on' : ''} onClick={() => setSt((x) => ({ ...x, seconds: s }))}>
                      {s} s
                    </button>
                  ))}
                </span>
              </label>
              <label className="field">
                <span>{t('rhythm.click')}</span>
                <select value={st.click} disabled={running} onChange={(e) => setSt((x) => ({ ...x, click: e.target.value as ClickMode }))}>
                  <option value="beats">{t('rhythm.clickBeats')}</option>
                  <option value="notes">{t('rhythm.clickNotes')}</option>
                  <option value="off">{t('rhythm.clickOff')}</option>
                </select>
              </label>
              {drill.running ? (
                <button type="button" className="btn" onClick={drill.stop}>
                  {t('drill.stop')}
                </button>
              ) : (
                <button type="button" className="btn primary" disabled={running || !settings} onClick={() => start(ex)}>
                  {t('drill.start')}
                </button>
              )}
            </div>
          </div>

          {(drill.session || calib.session) && (
            <div className="card lane-card">
              <Lane session={(drill.session ?? calib.session)!} notes={drill.session ? drill.notes : calib.notes} od={settings?.drillOd ?? 8} />
              <p className="muted small">{t('drill.runningHint', { k1: keyLabel(settings?.keyK1 ?? ''), k2: keyLabel(settings?.keyK2 ?? '') })}</p>
            </div>
          )}

          {drill.result && !drill.running && (
            <DrillResults r={drill.result} od={settings?.drillOd ?? 8} f={f}>
              {drill.result.notes.length < 20 && <p className="muted small">{t('drill.tooShort')}</p>}
            </DrillResults>
          )}

          <h2>{t('drill.history')}</h2>
          <DrillHistory kind="rhythm" name={ex.id} refresh={drill.saved} f={f} />
        </section>
      </div>
    </div>
  );
}
