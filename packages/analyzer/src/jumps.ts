// Skoki na 1/2 (SPEC.md, sekcja 5.3).

import type { Beatmap } from './beatmap.ts';
import { beatLengthAt, circleRadius } from './difficulty.ts';
import { playableObjects } from './streams.ts';

export interface JumpStats {
  /** liczba przejść na 1/2 (odstęp > 1/4 i ≤ 1/2 uderzenia) */
  halfBeatMoves: number;
  /** skoki na 1/2 dłuższe niż 1,5 średnicy kółka */
  jumpsOver1_5Diameters: number;
  /** skoki na 1/2 dłuższe niż 3 średnice kółka */
  jumpsOver3Diameters: number;
  /** średnia odległość przejść na 1/2, w średnicach kółka */
  averageHalfBeatDistance: number;
}

export function jumpStats(beatmap: Beatmap, tolerance = 1.15): JumpStats {
  const objs = playableObjects(beatmap);
  const r = circleRadius(beatmap.difficulty.cs);
  const diameter = 2 * r;
  let moves = 0;
  let over15 = 0;
  let over3 = 0;
  let sum = 0;
  for (let i = 1; i < objs.length; i++) {
    const a = objs[i - 1]!;
    const b = objs[i]!;
    const gap = b.time - a.time;
    const beat = beatLengthAt(beatmap, a.time);
    if (gap > (beat / 4) * tolerance && gap <= (beat / 2) * tolerance) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      moves++;
      sum += d / diameter;
      if (d > 1.5 * diameter) over15++;
      if (d > 3 * diameter) over3++;
    }
  }
  return {
    halfBeatMoves: moves,
    jumpsOver1_5Diameters: over15,
    jumpsOver3Diameters: over3,
    averageHalfBeatDistance: moves ? sum / moves : 0
  };
}
