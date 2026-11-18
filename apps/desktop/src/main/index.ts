// Proces główny Electrona: okno programu i operacje na plikach.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { analyzeMapText, analyzeReplay, parseBeatmap, parseReplay, ReplayParseError } from '@osu-trainer/analyzer';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type OpenDialogOptions } from 'electron';
import { IPC, type AnalyzeResult, type DialogLabels, type ReplayResult } from '../shared/api.ts';
import { defaultSongsFolder, findMap, md5OfFile, rememberFolder } from './mapIndex.ts';

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

async function pickFile(sender: Electron.WebContents, options: OpenDialogOptions): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender);
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return picked.canceled ? null : (picked.filePaths[0] ?? null);
}

// ---------- mapy ----------

async function analyzeMapFile(file: string): Promise<AnalyzeResult> {
  try {
    const text = await readFile(file, 'utf8');
    return { ok: true, file, analysis: analyzeMapText(text) };
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

// ---------- replaye ----------

async function analyzeReplayFile(
  sender: Electron.WebContents,
  replayFile: string,
  mapHint: string | null,
  labels: DialogLabels
): Promise<ReplayResult> {
  try {
    const replay = parseReplay(new Uint8Array(await readFile(replayFile)));
    let mapFile = await findMap(replay.beatmapMd5, mapHint, replayFile);

    if (!mapFile) {
      // nie znamy tej mapy – prosimy o wskazanie jej raz, potem program ją pamięta
      const picked = await pickFile(sender, {
        title: labels?.pickMapForReplay,
        defaultPath: defaultSongsFolder(),
        properties: ['openFile'],
        filters: [{ name: 'osu! beatmap', extensions: ['osu'] }]
      });
      if (!picked) return { ok: false, error: 'map-not-selected', replayFile };
      await rememberFolder(dirname(picked));
      if ((await md5OfFile(picked)) !== replay.beatmapMd5) return { ok: false, error: 'map-mismatch', replayFile };
      mapFile = picked;
    }

    const beatmap = parseBeatmap(await readFile(mapFile, 'utf8'));
    return {
      ok: true,
      replayFile,
      mapFile,
      map: {
        title: beatmap.metadata.title,
        artist: beatmap.metadata.artist,
        version: beatmap.metadata.version,
        creator: beatmap.metadata.creator,
        endMs: Math.max(...beatmap.hitObjects.map((o) => o.endTime))
      },
      analysis: analyzeReplay(beatmap, replay)
    };
  } catch (e) {
    const message = (e as Error).message;
    if (e instanceof ReplayParseError && message.includes('trybu')) return { ok: false, error: 'other-mode', replayFile };
    return { ok: false, error: message, replayFile };
  }
}

ipcMain.handle(IPC.pickAndAnalyzeReplay, async (event, labels: DialogLabels) => {
  const local = process.env['LOCALAPPDATA'];
  const file = await pickFile(event.sender, {
    title: labels?.pickReplay,
    defaultPath: local ? join(local, 'osu!', 'Replays') : undefined,
    properties: ['openFile'],
    filters: [{ name: 'osu! replay', extensions: ['osr'] }]
  });
  return file ? analyzeReplayFile(event.sender, file, null, labels) : null;
});

ipcMain.handle(IPC.analyzeReplayFile, async (event, file: unknown, mapHint: unknown, labels: DialogLabels) => {
  if (typeof file !== 'string' || !file.toLowerCase().endsWith('.osr')) {
    return { ok: false, error: 'not-osr-file' } satisfies ReplayResult;
  }
  return analyzeReplayFile(event.sender, file, typeof mapHint === 'string' ? mapHint : null, labels);
});

ipcMain.handle(IPC.version, () => app.getVersion());

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.github.pixelmon770.osutrainer');
  // Bez paska File/Edit/View – program ma własne menu z boku.
  Menu.setApplicationMenu(null);
  // F12 otwiera narzędzia deweloperskie w trybie dev, Ctrl+R jest wyłączone w wersji gotowej.
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
