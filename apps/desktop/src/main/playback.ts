// Dane do Analizatora klatek: klatki replaya i obiekty mapy ustawione dokładnie tak,
// jak widział je gracz (stosy, HardRock, ścieżki sliderów, numery w combo).

import { readFile } from 'node:fs/promises';
import { circleRadius, effectiveDifficulty, Mods, parseBeatmap, parseReplay, placeObjects, preemptMs, sliderPath } from '@osu-trainer/analyzer';
import type { PlaybackData, PlaybackObject } from '../shared/api.ts';
import { getReplay } from './history.ts';

export async function loadPlayback(id: string): Promise<PlaybackData | { error: string }> {
  const r = await getReplay(id);
  if (!r || !r.ok) return { error: 'not-found' };
  let replayBytes: Buffer;
  let mapText: string;
  try {
    replayBytes = await readFile(r.replayFile);
    mapText = await readFile(r.mapFile, 'utf8');
  } catch {
    return { error: 'files-missing' };
  }
  const replay = parseReplay(new Uint8Array(replayBytes));
  const beatmap = parseBeatmap(mapText);
  const diff = effectiveDifficulty(beatmap, replay.mods);
  const flipY = (replay.mods & Mods.HardRock) !== 0;
  const radius = circleRadius(diff.cs);
  const placed = placeObjects(beatmap, { ...diff, flipY });

  let combo = 0;
  let comboIndex = -1;
  let noteIndex = 0;
  const objects: PlaybackObject[] = beatmap.hitObjects.map((o, i) => {
    if (o.newCombo || i === 0 || o.kind === 'spinner') {
      combo = 0;
      comboIndex++;
    }
    combo++;
    const pl = placed[i]!;
    const offset = pl.stackHeight * (radius / 10);
    let path: { x: number; y: number }[] | undefined;
    if (o.kind === 'slider' && o.curvePoints && o.curveType) {
      path = sliderPath(o.curveType, o.curvePoints, o.pixelLength).map((p) => ({
        x: p.x - offset,
        y: (flipY ? 384 - p.y : p.y) - offset
      }));
    }
    return {
      noteIndex: o.kind === 'spinner' ? -1 : noteIndex++,
      kind: o.kind,
      time: o.time,
      endTime: o.endTime,
      x: pl.x,
      y: pl.y,
      slides: o.slides,
      path,
      combo,
      comboIndex
    };
  });

  return {
    frames: replay.frames.map((f) => [f.time, f.x, f.y, f.keys] as [number, number, number, number]),
    objects,
    radius,
    preempt: preemptMs(diff.ar),
    hidden: (replay.mods & Mods.Hidden) !== 0,
    mods: r.analysis.mods,
    title: `${r.map.artist} – ${r.map.title} [${r.map.version}]`,
    analysis: r.analysis
  };
}
