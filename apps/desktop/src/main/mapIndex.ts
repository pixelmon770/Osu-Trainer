// Szukanie pliku .osu pasującego do replaya. Replay zapisuje tylko sumę MD5 mapy.
// Kolejność: przeciągnięty plik → zapamiętane mapy → osu!.db → folder replaya
// → ostatnio zmienione foldery w Songs (świeżo pobrane mapy osu! dopisuje do osu!.db dopiero po zamknięciu gry).

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseOsuDb } from '@osu-trainer/analyzer';
import { app } from 'electron';
import { getSettings, songsFolder } from './settings.ts';

type Index = Record<string, string>;

let remembered: Index | null = null;
const indexFile = () => join(app.getPath('userData'), 'map-index.json');

async function loadRemembered(): Promise<Index> {
  if (remembered) return remembered;
  try {
    remembered = JSON.parse(await readFile(indexFile(), 'utf8')) as Index;
  } catch {
    remembered = {};
  }
  return remembered;
}

async function saveRemembered(): Promise<void> {
  if (remembered) await writeFile(indexFile(), JSON.stringify(remembered), 'utf8').catch(() => undefined);
}

export async function md5OfFile(file: string): Promise<string> {
  return createHash('md5').update(await readFile(file)).digest('hex');
}

/** Zapamiętuje wszystkie mapy z folderu (jeden folder = jedna piosenka, zwykle kilka poziomów). */
export async function rememberFolder(folder: string): Promise<void> {
  const index = await loadRemembered();
  const names = await readdir(folder).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.osu')) continue;
    const file = join(folder, name);
    index[await md5OfFile(file)] = file;
  }
  await saveRemembered();
}

// ---------- osu!.db ----------

interface DbCache {
  path: string;
  mtimeMs: number;
  byMd5: Map<string, { folder: string; file: string }>;
  maps: number;
  player: string;
  error: string | null;
}
let dbCache: DbCache | null = null;

/** Wczytuje osu!.db (ponownie tylko wtedy, gdy plik się zmienił). */
export async function loadOsuDb(): Promise<DbCache | null> {
  const osu = getSettings().osuFolder;
  if (!osu) return null;
  const path = join(osu, 'osu!.db');
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
  if (dbCache && dbCache.path === path && dbCache.mtimeMs === mtimeMs) return dbCache;
  try {
    const db = parseOsuDb(new Uint8Array(await readFile(path)));
    const byMd5 = new Map<string, { folder: string; file: string }>();
    for (const b of db.beatmaps) if (b.md5) byMd5.set(b.md5, { folder: b.folderName, file: b.osuFileName });
    dbCache = { path, mtimeMs, byMd5, maps: db.beatmaps.length, player: db.player, error: null };
  } catch (e) {
    dbCache = { path, mtimeMs, byMd5: new Map(), maps: 0, player: '', error: (e as Error).message };
  }
  return dbCache;
}

// ---------- szukanie ----------

async function matches(file: string, md5: string): Promise<boolean> {
  return existsSync(file) && (await md5OfFile(file).catch(() => '')) === md5;
}

/** Przegląda najświeższe foldery w Songs (świeżo pobrane mapy). */
async function scanRecentSongs(md5: string, limit = 300): Promise<string | null> {
  const songs = songsFolder(getSettings().osuFolder);
  if (!songs) return null;
  const names = await readdir(songs).catch(() => [] as string[]);
  const folders: { path: string; mtime: number }[] = [];
  for (const n of names) {
    const p = join(songs, n);
    const s = await stat(p).catch(() => null);
    if (s?.isDirectory()) folders.push({ path: p, mtime: s.mtimeMs });
  }
  folders.sort((a, b) => b.mtime - a.mtime);
  const index = await loadRemembered();
  for (const f of folders.slice(0, limit)) {
    const files = await readdir(f.path).catch(() => [] as string[]);
    for (const name of files) {
      if (!name.toLowerCase().endsWith('.osu')) continue;
      const file = join(f.path, name);
      const sum = await md5OfFile(file).catch(() => '');
      if (sum) index[sum] = file;
      if (sum === md5) {
        await saveRemembered();
        return file;
      }
    }
  }
  await saveRemembered();
  return null;
}

export async function findMap(md5: string, hint: string | null, replayFile: string): Promise<string | null> {
  if (hint && (await matches(hint, md5))) {
    await rememberFolder(dirname(hint));
    return hint;
  }

  const index = await loadRemembered();
  const known = index[md5];
  if (known && (await matches(known, md5))) return known;

  const db = await loadOsuDb();
  const entry = db?.byMd5.get(md5);
  const songs = songsFolder(getSettings().osuFolder);
  if (entry && songs) {
    const file = join(songs, entry.folder, entry.file);
    if (await matches(file, md5)) {
      index[md5] = file;
      await saveRemembered();
      return file;
    }
  }

  await rememberFolder(dirname(replayFile));
  if (index[md5]) return index[md5]!;

  return scanRecentSongs(md5);
}

/** Domyślny folder do okna wyboru mapy. */
export function defaultSongsFolder(): string | undefined {
  return songsFolder(getSettings().osuFolder) ?? undefined;
}
