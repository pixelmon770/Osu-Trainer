// Czytanie mapy: nakładanie nut i widoczność (SPEC.md, sekcja 5.3).

import type { Beatmap } from './beatmap.ts';
import { beatLengthAt, circleRadius, preemptMs } from './difficulty.ts';
import { playableObjects } from './streams.ts';

export interface ReadingStats {
  preemptMs: number;
  /** ile uderzeń do przodu widać na początku mapy (preempt / długość uderzenia) */
  beatsVisibleAhead: number;
  /** średnia liczba obiektów pojawiających się w oknie widoczności danego obiektu */
  averageVisibleObjects: number;
  /** % obiektów, na które nachodzi niesąsiednia nuta, zanim znikną */
  overlapPercent: number;
}

export function readingStats(beatmap: Beatmap): ReadingStats {
  const objs = playableObjects(beatmap);
  const r = circleRadius(beatmap.difficulty.cs);
  const preempt = preemptMs(beatmap.difficulty.ar);
  let visible = 0;
  let overlapped = 0;
  for (let i = 0; i < objs.length; i++) {
    const a = objs[i]!;
    let hit = false;
    for (let j = i + 1; j < objs.length && objs[j]!.time - a.time < preempt; j++) {
      visible++;
      if (j > i + 1) {
        const b = objs[j]!;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        // d > 2: pomijamy idealnie ułożone stosy (stack), które gra i tak rozsuwa
        if (d < 2 * r && d > 2) hit = true;
      }
    }
    if (hit) overlapped++;
  }
  return {
    preemptMs: preempt,
    beatsVisibleAhead: preempt / beatLengthAt(beatmap, objs[0]?.time ?? 0),
    averageVisibleObjects: objs.length ? visible / objs.length : 0,
    overlapPercent: objs.length ? (overlapped / objs.length) * 100 : 0
  };
}
