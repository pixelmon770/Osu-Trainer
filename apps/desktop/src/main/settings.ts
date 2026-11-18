// Ustawienia programu w pliku settings.json w folderze danych programu
// (Windows: %APPDATA%\@osu-trainer\desktop albo %APPDATA%\osu! Trener).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { app } from 'electron';
import type { Settings, WatchedFolder } from '../shared/api.ts';

const file = () => join(app.getPath('userData'), 'settings.json');

function detectOsuFolder(): string | null {
  const local = process.env['LOCALAPPDATA'];
  const candidates = [local && join(local, 'osu!'), 'C:\\osu!', 'D:\\osu!', 'C:\\Program Files\\osu!', 'C:\\Games\\osu!'];
  for (const c of candidates) if (c && existsSync(join(c, 'osu!.exe'))) return c;
  return null;
}

const defaults = (): Settings => ({
  osuFolder: detectOsuFolder(),
  watchDataR: true,
  watchReplays: true,
  extraFolders: [],
  autoAnalyze: true,
  notifications: true,
  openAtLogin: false,
  language: 'en'
});

let current: Settings | null = null;

export function getSettings(): Settings {
  if (current) return current;
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>;
  } catch {
    // pierwszy start albo uszkodzony plik – zostają ustawienia domyślne
  }
  current = { ...defaults(), ...saved };
  if (!current.osuFolder) current.osuFolder = detectOsuFolder();
  return current;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  current = { ...getSettings(), ...patch };
  await writeFile(file(), JSON.stringify(current, null, 2), 'utf8');
  return current;
}

/**
 * Folder z mapami. Domyślnie osu!/Songs, ale można go zmienić w osu!
 * (BeatmapDirectory w pliku osu!.<nazwa użytkownika>.cfg).
 */
export function songsFolder(osuFolder: string | null): string | null {
  if (!osuFolder || !existsSync(osuFolder)) return null;
  try {
    const cfg = readdirSync(osuFolder).find((n) => /^osu!\..+\.cfg$/i.test(n) && n.toLowerCase() !== 'osu!.cfg');
    if (cfg) {
      const line = readFileSync(join(osuFolder, cfg), 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith('BeatmapDirectory'));
      const dir = line?.split('=').slice(1).join('=').trim();
      if (dir) {
        const full = isAbsolute(dir) ? dir : join(osuFolder, dir);
        if (existsSync(full)) return full;
      }
    }
  } catch {
    // brak dostępu do pliku konfiguracji – zostaje domyślny folder
  }
  const songs = join(osuFolder, 'Songs');
  return existsSync(songs) ? songs : null;
}

export function watchedFolders(s: Settings = getSettings()): WatchedFolder[] {
  const list: WatchedFolder[] = [];
  if (s.osuFolder) {
    const dataR = join(s.osuFolder, 'Data', 'r');
    const replays = join(s.osuFolder, 'Replays');
    list.push({ path: dataR, kind: 'data-r', enabled: s.watchDataR, exists: existsSync(dataR) });
    list.push({ path: replays, kind: 'replays', enabled: s.watchReplays, exists: existsSync(replays) });
  }
  for (const p of s.extraFolders) list.push({ path: p, kind: 'extra', enabled: true, exists: existsSync(p) });
  return list;
}
