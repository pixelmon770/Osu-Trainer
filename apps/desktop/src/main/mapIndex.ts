// Szukanie pliku .osu pasującego do replaya. Replay zapisuje tylko sumę MD5 mapy,
// więc pamiętamy pary MD5 → ścieżka w pliku map-index.json w folderze danych programu.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';

type Index = Record<string, string>;

let cache: Index | null = null;
const indexFile = () => join(app.getPath('userData'), 'map-index.json');

async function load(): Promise<Index> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(indexFile(), 'utf8')) as Index;
  } catch {
    cache = {};
  }
  return cache;
}

async function save(): Promise<void> {
  if (cache) await writeFile(indexFile(), JSON.stringify(cache, null, 1), 'utf8').catch(() => undefined);
}

export async function md5OfFile(file: string): Promise<string> {
  return createHash('md5').update(await readFile(file)).digest('hex');
}

/** Zapamiętuje wszystkie mapy z folderu (jeden folder = jedna piosenka, zwykle kilka poziomów). */
export async function rememberFolder(folder: string): Promise<void> {
  const index = await load();
  const names = await readdir(folder).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.osu')) continue;
    const file = join(folder, name);
    index[await md5OfFile(file)] = file;
  }
  await save();
}

/** Szuka mapy: przeciągnięty plik → zapamiętany indeks → folder replaya. Gdy nic nie pasuje, zwraca null i program pyta o mapę. */
export async function findMap(md5: string, hint: string | null, replayFile: string): Promise<string | null> {
  if (hint && existsSync(hint) && (await md5OfFile(hint)) === md5) {
    await rememberFolder(dirname(hint));
    return hint;
  }
  const index = await load();
  const known = index[md5];
  if (known && existsSync(known) && (await md5OfFile(known)) === md5) return known;

  await rememberFolder(dirname(replayFile));
  return index[md5] ?? null;
}

/** Domyślny folder z mapami osu!stable w Windows. */
export function defaultSongsFolder(): string | undefined {
  const local = process.env['LOCALAPPDATA'];
  const songs = local ? join(local, 'osu!', 'Songs') : undefined;
  return songs && existsSync(songs) ? songs : undefined;
}
