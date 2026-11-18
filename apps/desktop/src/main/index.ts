// Proces główny Electrona: okno programu, pliki, historia replayów i obserwowanie folderów.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { analyzeMapText } from '@osu-trainer/analyzer';
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell, type OpenDialogOptions } from 'electron';
import {
  IPC,
  type AnalyzeResult,
  type DialogLabels,
  type ImportProgress,
  type ReplayResult,
  type Settings,
  type SettingsStatus
} from '../shared/api.ts';
import * as history from './history.ts';
import { defaultSongsFolder, loadOsuDb } from './mapIndex.ts';
import { analyzeReplayFile } from './replayService.ts';
import { getSettings, songsFolder, updateSettings, watchedFolders } from './settings.ts';
import { text } from './texts.ts';
import { ReplayWatcher } from './watcher.ts';

// Jeden stały folder danych – taki sam w trybie dev i w wersji zainstalowanej.
app.setPath('userData', join(app.getPath('appData'), 'osu-trainer'));

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1012',
    title: 'osu! Trener',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.on('ready-to-show', () => win.show());

  // Linki zewnętrzne otwieramy w przeglądarce, nie w oknie programu.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

async function pickFile(sender: Electron.WebContents, options: OpenDialogOptions): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender);
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return picked.canceled ? null : (picked.filePaths[0] ?? null);
}

// ---------- mapy ----------

async function analyzeMapFile(file: string): Promise<AnalyzeResult> {
  try {
    return { ok: true, file, analysis: analyzeMapText(await readFile(file, 'utf8')) };
  } catch (e) {
    return { ok: false, file, error: (e as Error).message };
  }
}

ipcMain.handle(IPC.pickAndAnalyzeMap, async (event, labels: DialogLabels) => {
  const file = await pickFile(event.sender, {
    title: labels?.pickMap,
    defaultPath: defaultSongsFolder(),
    properties: ['openFile'],
    filters: [{ name: 'osu! beatmap', extensions: ['osu'] }]
  });
  return file ? analyzeMapFile(file) : null;
});

ipcMain.handle(IPC.analyzeMapFile, async (_event, file: unknown) => {
  if (typeof file !== 'string' || !file.toLowerCase().endsWith('.osu')) {
    return { ok: false, error: 'not-osu-file' } satisfies AnalyzeResult;
  }
  return analyzeMapFile(file);
});

// ---------- replaye otwierane ręcznie ----------

async function analyzeInteractive(sender: Electron.WebContents, file: string, mapHint: string | null, labels: DialogLabels) {
  const { result, summary } = await analyzeReplayFile(file, {
    mapHint,
    askForMap: () =>
      pickFile(sender, {
        title: labels?.pickMapForReplay,
        defaultPath: defaultSongsFolder(),
        properties: ['openFile'],
        filters: [{ name: 'osu! beatmap', extensions: ['osu'] }]
      })
  });
  if (summary) send(IPC.replayAdded, summary);
  return result;
}

ipcMain.handle(IPC.pickAndAnalyzeReplay, async (event, labels: DialogLabels) => {
  const s = getSettings();
  const file = await pickFile(event.sender, {
    title: labels?.pickReplay,
    defaultPath: s.osuFolder ? join(s.osuFolder, 'Replays') : undefined,
    properties: ['openFile'],
    filters: [{ name: 'osu! replay', extensions: ['osr'] }]
  });
  return file ? analyzeInteractive(event.sender, file, null, labels) : null;
});

ipcMain.handle(IPC.analyzeReplayFile, async (event, file: unknown, mapHint: unknown, labels: DialogLabels) => {
  if (typeof file !== 'string' || !file.toLowerCase().endsWith('.osr')) {
    return { ok: false, error: 'not-osr-file' } satisfies ReplayResult;
  }
  return analyzeInteractive(event.sender, file, typeof mapHint === 'string' ? mapHint : null, labels);
});

// ---------- historia ----------

ipcMain.handle(IPC.listReplays, (_e, limit: number) => history.listReplays(Number(limit) || 100));
ipcMain.handle(IPC.getReplay, (_e, id: string) => history.getReplay(String(id)));
ipcMain.handle(IPC.deleteReplay, (_e, id: string) => history.deleteReplay(String(id)));

let importRunning = false;
ipcMain.handle(IPC.importReplays, async (_e, days: number, limit: number): Promise<ImportProgress> => {
  const progress: ImportProgress = { done: 0, total: 0, imported: 0, skipped: 0, failed: 0, finished: false };
  if (importRunning) return { ...progress, finished: true };
  importRunning = true;
  try {
    const since = Date.now() - Math.max(1, Number(days) || 30) * 86_400_000;
    const known = await history.knownFiles();
    const candidates: { file: string; mtime: number }[] = [];
    for (const folder of watchedFolders().filter((f) => f.enabled && f.exists)) {
      for (const name of await readdir(folder.path).catch(() => [] as string[])) {
        if (!name.toLowerCase().endsWith('.osr')) continue;
        const file = join(folder.path, name);
        if (known.has(file.toLowerCase())) continue;
        const s = await stat(file).catch(() => null);
        if (s && s.mtimeMs >= since) candidates.push({ file, mtime: s.mtimeMs });
      }
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    const todo = candidates.slice(0, Math.max(1, Math.min(Number(limit) || 100, 1000)));
    progress.total = todo.length;
    send(IPC.importProgress, progress);
    for (const c of todo) {
      const { result, summary, duplicate } = await analyzeReplayFile(c.file, { skipIfKnown: true });
      if (summary) progress.imported++;
      else if (duplicate || (result && !result.ok && result.error === 'map-not-found')) progress.skipped++;
      else progress.failed++;
      progress.done++;
      send(IPC.importProgress, progress);
    }
  } finally {
    importRunning = false;
  }
  progress.finished = true;
  send(IPC.importProgress, progress);
  return progress;
});

// ---------- automatyczne replaye ----------

const watcher = new ReplayWatcher(async (file) => {
  const s = getSettings();
  if (!s.autoAnalyze) return;
  const { result, summary } = await analyzeReplayFile(file, { skipIfKnown: true });
  if (summary) {
    send(IPC.replayAdded, summary);
    if (s.notifications && !mainWindow?.isFocused() && Notification.isSupported()) {
      new Notification({
        title: text(s.language, 'newReplay'),
        body: text(s.language, 'replayBody', {
          map: `${summary.title} [${summary.version}]`,
          acc: summary.accuracy.toFixed(2),
          ur: summary.ur.toFixed(0)
        })
      }).show();
    }
  } else if (result && !result.ok) {
    send(IPC.replayFailed, { file, error: result.error });
  }
});

function restartWatcher(): void {
  watcher.start(
    watchedFolders()
      .filter((f) => f.enabled && f.exists)
      .map((f) => f.path)
  );
}

// ---------- ustawienia ----------

async function status(): Promise<SettingsStatus> {
  const settings = getSettings();
  const db = await loadOsuDb();
  return {
    settings,
    osuFolderFound: !!settings.osuFolder,
    songsFolder: songsFolder(settings.osuFolder),
    osuDb: db ? { maps: db.maps, player: db.player, error: db.error } : null,
    folders: watchedFolders(settings),
    canAutostart: app.isPackaged,
    historyCount: await history.countReplays()
  };
}

ipcMain.handle(IPC.getSettings, () => status());

ipcMain.handle(IPC.updateSettings, async (_e, patch: Partial<Settings>) => {
  const allowed: (keyof Settings)[] = [
    'osuFolder',
    'watchDataR',
    'watchReplays',
    'extraFolders',
    'autoAnalyze',
    'notifications',
    'openAtLogin',
    'language'
  ];
  const clean = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => allowed.includes(k as keyof Settings)));
  const s = await updateSettings(clean);
  if ('openAtLogin' in clean && app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.openAtLogin });
  if (['osuFolder', 'watchDataR', 'watchReplays', 'extraFolders'].some((k) => k in clean)) restartWatcher();
  return status();
});

ipcMain.handle(IPC.pickFolder, async (event, labels: DialogLabels) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = { title: labels?.pickFolder, properties: ['openDirectory'] };
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return picked.canceled ? null : (picked.filePaths[0] ?? null);
});

ipcMain.handle(IPC.openPath, async (_e, path: unknown) => {
  if (typeof path === 'string') await shell.openPath(path);
});

ipcMain.handle(IPC.version, () => app.getVersion());

// ---------- start ----------

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.github.pixelmon770.osutrainer');
  // Bez paska File/Edit/View – program ma własne menu z boku.
  Menu.setApplicationMenu(null);
  // F12 otwiera narzędzia deweloperskie w trybie dev, Ctrl+R jest wyłączone w wersji gotowej.
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
  restartWatcher();
  void loadOsuDb(); // wczytaj listę map od razu, żeby pierwszy replay nie czekał
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  watcher.stop();
  void history.flushNow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
