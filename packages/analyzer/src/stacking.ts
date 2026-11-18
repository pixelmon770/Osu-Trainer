// Układanie nut w stosy (stacking) jak w osu!stable dla map w formacie v6+.
// Nuty leżące w tym samym miejscu i blisko w czasie są przesuwane w lewo-górę,
// żeby było je widać. Bez tego kursor „nie trafiałby” w część nut w replayu.

import type { Beatmap } from './beatmap.ts';
import { circleRadius, preemptMs } from './difficulty.ts';

const STACK_DISTANCE = 3;

export interface PlacedObject {
  index: number;
  time: number;
  endTime: number;
  kind: 'circle' | 'slider' | 'spinner';
  /** pozycja po uwzględnieniu stosu i HR */
  x: number;
  y: number;
  stackHeight: number;
}

export interface PlaceOptions {
  cs: number;
  ar: number;
  /** HardRock odwraca mapę w pionie */
  flipY: boolean;
}

export function placeObjects(beatmap: Beatmap, opts: PlaceOptions): PlacedObject[] {
  const objs = beatmap.hitObjects;
  const flip = (y: number) => (opts.flipY ? 384 - y : y);
  const pos = objs.map((o) => ({ x: o.x, y: flip(o.y), ex: o.endX, ey: flip(o.endY) }));
  const stack = new Array<number>(objs.length).fill(0);
  const threshold = preemptMs(opts.ar) * beatmap.stackLeniency;
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

  if (beatmap.formatVersion >= 6) {
    for (let i = objs.length - 1; i > 0; i--) {
      let n = i;
      let iIdx = i;
      const objI = objs[i]!;
      if (stack[i] !== 0 || objI.kind === 'spinner') continue;

      if (objI.kind === 'circle') {
        while (--n >= 0) {
          const objN = objs[n]!;
          if (objN.kind === 'spinner') continue;
          if (objs[iIdx]!.time - objN.endTime > threshold) break;
          const pN = pos[n]!;
          const pI = pos[iIdx]!;
          // koniec slidera pod nutą: stos „odwrócony” – przesuwamy późniejsze nuty
          if (objN.kind === 'slider' && dist(pN.ex, pN.ey, pI.x, pI.y) < STACK_DISTANCE) {
            const offset = stack[iIdx]! - stack[n]! + 1;
            for (let j = n + 1; j <= i; j++) {
              const pJ = pos[j]!;
              if (dist(pN.ex, pN.ey, pJ.x, pJ.y) < STACK_DISTANCE) stack[j] = stack[j]! - offset;
            }
            break;
          }
          if (dist(pN.x, pN.y, pI.x, pI.y) < STACK_DISTANCE) {
            stack[n] = stack[iIdx]! + 1;
            iIdx = n;
          }
        }
      } else if (objI.kind === 'slider') {
        while (--n >= 0) {
          const objN = objs[n]!;
          if (objN.kind === 'spinner') continue;
          if (objs[iIdx]!.time - objN.time > threshold) break;
          const pN = pos[n]!;
          const pI = pos[iIdx]!;
          if (dist(pN.ex, pN.ey, pI.x, pI.y) < STACK_DISTANCE) {
            stack[n] = stack[iIdx]! + 1;
            iIdx = n;
          }
        }
      }
    }
  }

  const step = circleRadius(opts.cs) / 10;
  return objs.map((o, i) => ({
    index: i,
    time: o.time,
    endTime: o.endTime,
    kind: o.kind,
    x: pos[i]!.x - stack[i]! * step,
    y: pos[i]!.y - stack[i]! * step,
    stackHeight: stack[i]!
  }));
}
