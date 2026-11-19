// osu!lazer: dane gry w %APPDATA%\osu (albo w folderze wybranym w grze – storage.ini, FullPath).
// Lazer nie ma folderu Songs ani Replays: wszystkie pliki leżą w files/<a>/<ab>/<skrót> bez rozszerzeń,
// a opis jest w bazie Realm. Nie czytamy Realm – replaye i mapy rozpoznajemy po pierwszych bajtach pliku.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

export type FileKind = 'osr' | 'osu' | null;

export function detectLazerFolder(): string | null {
  const roaming = process.env['APPDATA'];
  if (!roaming) return null;
  const base = join(roaming, 'osu');
  // folder przeniesiony w grze („Change folder location”)
  try {
    const ini = readFileSync(join(base, 'storage.ini'), 'utf8');
    const custom = ini
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith('FullPath'))
      ?.split('=')
      .slice(1)
      .join('=')
      .trim();
    if (custom && existsSync(join(custom, 'files'))) return custom;
  } catch {
    // brak storage.ini = domyślne miejsce
  }
  return existsSync(join(base, 'files')) ? base : null;
}

export const lazerFilesDir = (folder: string) => join(folder, 'files');

/** Rozpoznaje replay (.osr) albo mapę (.osu) po nagłówku – pliki lazera nie mają rozszerzeń. */
export async function sniffFile(path: string): Promise<FileKind> {
  let fh;
  try {
    fh = await open(path, 'r');
    const buf = Buffer.alloc(48);
    const { bytesRead } = await fh.read(buf, 0, 48, 0);
    if (bytesRead < 16) return null;
    return sniffBytes(buf.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

export function sniffBytes(b: Uint8Array): FileKind {
  const text = new TextDecoder().decode(b.subarray(0, 24)).replace(/^﻿/, '');
  if (text.startsWith('osu file format v')) return 'osu';
  // .osr: tryb (0–3), wersja gry (int32, data rrrrmmdd albo 3xxxxxxx w lazerze), potem MD5 mapy jako tekst 32 znaków
  if (b.length >= 40 && b[0]! <= 3) {
    const version = b[1]! | (b[2]! << 8) | (b[3]! << 16) | (b[4]! << 24);
    if (version >= 20_000_000 && version < 40_000_000 && b[5] === 0x0b && b[6] === 32) {
      const md5 = new TextDecoder().decode(b.subarray(7, 39));
      if (/^[0-9a-f]{32}$/.test(md5)) return 'osr';
    }
  }
  return null;
}

/** Wszystkie pliki magazynu lazera (files/a/ab/skrót). */
export async function* walkStore(dir: string): AsyncGenerator<string> {
  for (const a of await readdir(dir).catch(() => [] as string[])) {
    const pa = join(dir, a);
    for (const ab of await readdir(pa).catch(() => [] as string[])) {
      const pab = join(pa, ab);
      for (const name of await readdir(pab).catch(() => [] as string[])) yield join(pab, name);
    }
  }
}

// ---------- indeks map lazera (MD5 → plik) ----------

interface StoreIndex {
  /** nazwy plików już sprawdzonych (żeby kolejne skanowanie trwało sekundy, nie minuty) */
  seen: Record<string, 1>;
  maps: Record<string, string>;
}

let index: StoreIndex | null = null;
let indexing: Promise<void> | null = null;
let progress = { checked: 0, maps: 0, running: false };
const indexFile = () => join(app.getPath('userData'), 'lazer-index.json');

async function loadIndex(): Promise<StoreIndex> {
  if (index) return index;
  try {
    index = JSON.parse(await readFile(indexFile(), 'utf8')) as StoreIndex;
  } catch {
    index = { seen: {}, maps: {} };
  }
  progress.maps = Object.keys(index.maps).length;
  return index;
}

async function saveIndex(): Promise<void> {
  if (index) await writeFile(indexFile(), JSON.stringify(index), 'utf8').catch(() => undefined);
}

export function lazerIndexStatus() {
  return { ...progress };
}

/** Dopisuje jeden plik do indeksu (np. świeżo pobraną mapę wyłapaną przez obserwatora). */
export async function indexStoreFile(path: string, kind: FileKind): Promise<void> {
  const idx = await loadIndex();
  const name = path.split(/[\\/]/).pop()!;
  idx.seen[name] = 1;
  if (kind === 'osu') {
    idx.maps[createHash('md5').update(await readFile(path)).digest('hex')] = path;
    progress.maps = Object.keys(idx.maps).length;
  }
}

/** Przegląda magazyn lazera i zapisuje MD5 wszystkich map. Pierwszy raz może potrwać minutę. */
export function indexLazerStore(folder: string): Promise<void> {
  indexing ??= (async () => {
    progress = { ...progress, checked: 0, running: true };
    const idx = await loadIndex();
    let sinceSave = 0;
    for await (const file of walkStore(lazerFilesDir(folder))) {
      const name = file.slice(file.lastIndexOf(file.includes('\\') ? '\\' : '/') + 1);
      if (idx.seen[name]) continue;
      const kind = await sniffFile(file);
      if (kind === 'osu') {
        const md5 = createHash('md5').update(await readFile(file)).digest('hex');
        idx.maps[md5] = file;
      }
      idx.seen[name] = 1;
      progress.checked++;
      progress.maps = Object.keys(idx.maps).length;
      if (++sinceSave >= 2000) {
        sinceSave = 0;
        await saveIndex();
      }
    }
    await saveIndex();
    progress.running = false;
  })().finally(() => {
    indexing = null;
  });
  return indexing;
}

/** Szybkie sprawdzenie indeksu bez skanowania magazynu. */
export async function lookupLazerMap(md5: string): Promise<string | null> {
  const hit = (await loadIndex()).maps[md5];
  return hit && existsSync(hit) ? hit : null;
}

export async function findLazerMap(folder: string | null, md5: string): Promise<string | null> {
  if (!folder) return null;
  const idx = await loadIndex();
  const hit = idx.maps[md5];
  if (hit && existsSync(hit)) return hit;
  await indexLazerStore(folder); // dopisz nowe pliki i sprawdź jeszcze raz
  const again = idx.maps[md5];
  return again && existsSync(again) ? again : null;
}

/** Replaye z magazynu lazera zmienione po danej dacie. */
export async function recentLazerReplays(folder: string, sinceMs: number): Promise<{ file: string; mtime: number }[]> {
  const out: { file: string; mtime: number }[] = [];
  for await (const file of walkStore(lazerFilesDir(folder))) {
    const s = await stat(file).catch(() => null);
    if (!s || s.mtimeMs < sinceMs) continue;
    if ((await sniffFile(file)) === 'osr') out.push({ file, mtime: s.mtimeMs });
  }
  return out;
}
