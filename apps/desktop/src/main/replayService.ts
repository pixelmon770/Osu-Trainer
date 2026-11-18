// Analiza pliku .osr od początku do końca: odczyt, znalezienie mapy, analiza, zapis w historii.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { analyzeReplay, parseBeatmap, parseReplay, ReplayParseError } from '@osu-trainer/analyzer';
import type { ReplayResult, ReplaySummary } from '../shared/api.ts';
import { getReplay, hasReplay, saveReplay } from './history.ts';
import { findMap, md5OfFile, rememberFolder } from './mapIndex.ts';

export interface AnalyzeOptions {
  /** plik .osu przeciągnięty razem z replayem */
  mapHint?: string | null;
  /** gdy mapy nie ma: zapytaj użytkownika (tylko przy ręcznym otwieraniu, nie w tle) */
  askForMap?: () => Promise<string | null>;
  /** nie analizuj ponownie replaya, który już jest w historii (np. ten sam replay w Data/r i w Replays) */
  skipIfKnown?: boolean;
}

export async function analyzeReplayFile(
  replayFile: string,
  opts: AnalyzeOptions = {}
): Promise<{ result: ReplayResult; summary: ReplaySummary | null; duplicate?: boolean }> {
  try {
    const bytes = new Uint8Array(await readFile(replayFile));
    const replay = parseReplay(bytes);
    // ID: suma MD5 zapisana w replayu, a gdy jej brak – suma pliku
    const id = replay.replayMd5 || createHash('md5').update(bytes).digest('hex');
    if (opts.skipIfKnown && (await hasReplay(id))) return { result: await getReplay(id), summary: null, duplicate: true };

    let mapFile = await findMap(replay.beatmapMd5, opts.mapHint ?? null, replayFile);
    if (!mapFile) {
      if (!opts.askForMap) return { result: { ok: false, error: 'map-not-found', replayFile }, summary: null };
      const picked = await opts.askForMap();
      if (!picked) return { result: { ok: false, error: 'map-not-selected', replayFile }, summary: null };
      await rememberFolder(dirname(picked));
      if ((await md5OfFile(picked)) !== replay.beatmapMd5) {
        return { result: { ok: false, error: 'map-mismatch', replayFile }, summary: null };
      }
      mapFile = picked;
    }

    const beatmap = parseBeatmap(await readFile(mapFile, 'utf8'));
    const map = {
      title: beatmap.metadata.title,
      artist: beatmap.metadata.artist,
      version: beatmap.metadata.version,
      creator: beatmap.metadata.creator,
      endMs: Math.max(...beatmap.hitObjects.map((o) => o.endTime))
    };
    const analysis = analyzeReplay(beatmap, replay);
    const summary = await saveReplay({ id, replayFile, mapFile, beatmapMd5: replay.beatmapMd5, map, analysis });
    return { result: { ok: true, id, replayFile, mapFile, map, analysis }, summary };
  } catch (e) {
    const message = (e as Error).message;
    if (e instanceof ReplayParseError && message.includes('trybu')) {
      return { result: { ok: false, error: 'other-mode', replayFile }, summary: null };
    }
    return { result: { ok: false, error: message, replayFile }, summary: null };
  }
}
