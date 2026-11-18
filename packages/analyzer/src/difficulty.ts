// Podstawowe wzory osu! (SPEC.md, sekcja 5.1).

import type { Beatmap } from './beatmap.ts';

/** Promień kółka w osu!px. */
export function circleRadius(cs: number): number {
  return 54.4 - 4.48 * cs;
}

/** Czas (ms), przez jaki kółko jest widoczne przed trafieniem. AR 9 = 600 ms, AR 10 = 450 ms. */
export function preemptMs(ar: number): number {
  return ar > 5 ? 1200 - (750 * (ar - 5)) / 5 : 1200 + (600 * (5 - ar)) / 5;
}

/** Okna oceny (± ms) dla 300, 100 i 50. */
export function hitWindows(od: number): { great: number; ok: number; meh: number } {
  return { great: 80 - 6 * od, ok: 140 - 8 * od, meh: 200 - 10 * od };
}

/** Długość uderzenia (ms) obowiązująca w chwili `time`. */
export function beatLengthAt(beatmap: Beatmap, time: number): number {
  const tps = beatmap.timingPoints;
  let lo = 0;
  let hi = tps.length - 1;
  let idx = 0;
  // ostatni punkt z time <= czas obiektu (+1 ms tolerancji na zaokrąglenia)
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tps[mid]!.time <= time + 1) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return tps[idx]!.beatLength;
}

export function bpmFromBeatLength(beatLength: number): number {
  return 60000 / beatLength;
}
