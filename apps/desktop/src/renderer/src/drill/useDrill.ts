// Przebieg jednego ćwiczenia: start, tapnięcia, koniec, ocena i zapis wyniku.

import { judgeDrill, type DrillNote, type DrillResult } from '@osu-trainer/analyzer';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrillRecord, Settings } from '../../../shared/api.ts';
import { DrillSession, type ClickMode } from './engine.ts';

export interface DrillMeta {
  kind: DrillRecord['kind'];
  name: string;
  label: string;
  bpm: number;
}

export interface StartOptions {
  notes: DrillNote[];
  bpm: number;
  clickMode: ClickMode;
  meta: DrillMeta;
  countInBeats?: number;
  /** nie zapisuj w historii (np. kalibracja) */
  noSave?: boolean;
}

/** Ile nut musi minąć, żeby przerwane ćwiczenie trafiło do historii. */
const MIN_NOTES_TO_SAVE = 20;

export function useDrill(settings: Settings | null) {
  const [session, setSession] = useState<DrillSession | null>(null);
  const [notes, setNotes] = useState<DrillNote[]>([]);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [saved, setSaved] = useState<DrillRecord | null>(null);
  const current = useRef<DrillSession | null>(null);

  useEffect(() => () => current.current?.stop(false), []);

  const start = useCallback(
    async (o: StartOptions) => {
      if (!settings) return;
      current.current?.stop(false);
      setResult(null);
      setSaved(null);
      setNotes(o.notes);
      const od = settings.drillOd;
      const s = new DrillSession({
        notes: o.notes,
        bpm: o.bpm,
        clickMode: o.clickMode,
        volume: settings.volume,
        offsetMs: settings.audioOffsetMs,
        keyK1: settings.keyK1,
        keyK2: settings.keyK2,
        countInBeats: o.countInBeats ?? 4,
        onEnd: (taps, finished) => {
          // przerwane: oceniamy tylko nuty, które już minęły
          const until = finished ? Infinity : s.nowMs();
          const played = o.notes.filter((n) => n.time <= until);
          const r = judgeDrill(played, taps, od);
          setResult(r);
          setSession(null);
          if (o.noSave || played.length < MIN_NOTES_TO_SAVE) return;
          void window.api
            .saveDrill({
              kind: o.meta.kind,
              name: o.meta.name,
              label: o.meta.label,
              bpm: o.meta.bpm,
              durationMs: played.length ? played[played.length - 1]!.time : 0,
              notes: played.length,
              accuracy: r.accuracy,
              misses: r.misses,
              extraTaps: r.extraTaps,
              wrongFinger: r.wrongFinger,
              ur: r.errors.ur,
              mean: r.errors.mean,
              k1Mean: r.k1.mean,
              k2Mean: r.k2.mean,
              k1Ur: r.k1.ur,
              k2Ur: r.k2.ur,
              entryMean: r.entry.mean,
              tapSpread: r.tapSpread
            })
            .then(setSaved);
        }
      });
      current.current = s;
      setSession(s);
      await s.start();
    },
    [settings]
  );

  const stop = useCallback(() => current.current?.stop(false), []);

  return { session, notes, result, saved, start, stop, running: session !== null };
}
