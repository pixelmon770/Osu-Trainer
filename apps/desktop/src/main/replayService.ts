// Analiza pliku .osr od początku do końca: odczyt, znalezienie mapy, analiza, zapis w historii.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { analyzeReplay, parseBeatmap, parseReplay, ReplayParseError } from '@osu-trainer/analyzer';
import { isAbsolute, relative } from 'node:path';
import type { ReplayResult, ReplaySource, ReplaySummary } from '../shared/api.ts';
import { getSettings } from './settings.ts';
import { findPlay, getReplay, hasReplay, saveReplay } from './history.ts';
import { findMap, md5OfFile, rememberFolder } from './mapIndex.ts';

export interface AnalyzeOptions {
  /** plik .osu przeciągnięty razem z replayem */
  mapHint?: string | null;
  /** gdy mapy nie ma: zapytaj użytkownika (tylko przy ręcznym otwieraniu, nie w tle) */
  askForMap?: () => Promise<string | null>;
  /** nie analizuj ponownie replaya, który już jest w historii (np. ten sam replay w Data/r i w Replays) */
  skipIfKnown?: boolean;
  /** pomiń gry starsze niż tyle godzin (obserwator: tylko świeże gry, stare idą przez import) */
  maxAgeHours?: number;
}

function inside(folder: string | null, file: string): boolean {
  if (!folder) return false;
  const rel = relative(folder, file);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/** stable / lazer po folderze; lazer zapisuje też w replayu wersję 3xxxxxxx. */
function sourceOf(file: string, gameVersion: number): ReplaySource {
  const s = getSettings();
  if (inside(s.lazerFolder, file) || gameVersion >= 30_000_000) return 'lazer';
  if (inside(s.osuFolder, file)) return 'stable';
  return 'file';
}

export async function analyzeReplayFile(
  replayFile: string,
  opts: AnalyzeOptions = {}
): Promise<{ result: ReplayResult; summary: ReplaySummary | null; duplicate?: boolean; old?: boolean }> {
  try {
    const bytes = new Uint8Array(await readFile(replayFile));
    const replay = parseReplay(bytes);
    // ID: suma MD5 zapisana w replayu, a gdy jej brak – suma pliku
    if (opts.maxAgeHours && Date.now() - replay.playedAt.getTime() > opts.maxAgeHours * 3_600_000) {
      return { result: null, summary: null, old: true };
    }
    // ta sama gra może leżeć w kilku plikach (Data/r + eksport F2, lazer zapisujący replay ponownie)
    const existing = await findPlay(replay.beatmapMd5, replay.playedAt.toISOString(), replay.score);
    const id = existing ?? (replay.replayMd5 || createHash('md5').update(bytes).digest('hex'));
    if (opts.skipIfKnown && (existing || (await hasReplay(id)))) return { result: await getReplay(id), summary: null, duplicate: true };

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
    const source = sourceOf(replayFile, replay.gameVersion);
    const summary = await saveReplay({ id, replayFile, mapFile, beatmapMd5: replay.beatmapMd5, map, analysis, source });
    return { result: { ok: true, id, replayFile, mapFile, beatmapMd5: replay.beatmapMd5, map, analysis }, summary };
  } catch (e) {
    const message = (e as Error).message;
    if (e instanceof ReplayParseError && message.includes('trybu')) {
      return { result: { ok: false, error: 'other-mode', replayFile }, summary: null };
    }
    return { result: { ok: false, error: message, replayFile }, summary: null };
  }
}
