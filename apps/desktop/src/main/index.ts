// Proces główny Electrona: okno programu i operacje na plikach.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { analyzeMapText } from '@osu-trainer/analyzer';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IPC, type AnalyzeResult } from '../shared/api.ts';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1012',
    autoHideMenuBar: true,
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

async function analyzeFile(file: string): Promise<AnalyzeResult> {
  try {
    const text = await readFile(file, 'utf8');
    return { ok: true, file, analysis: analyzeMapText(text) };
  } catch (e) {
    return { ok: false, file, error: (e as Error).message };
  }
}

ipcMain.handle(IPC.pickAndAnalyzeMap, async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: 'Wybierz mapę (.osu)',
    properties: ['openFile' as const],
    filters: [{ name: 'osu! beatmap', extensions: ['osu'] }]
  };
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  const file = picked.filePaths[0];
  if (picked.canceled || !file) return null;
  return analyzeFile(file);
});

ipcMain.handle(IPC.analyzeMapFile, async (_event, file: unknown) => {
  if (typeof file !== 'string' || !file.toLowerCase().endsWith('.osu')) {
    return { ok: false, error: 'not-osu-file' } satisfies AnalyzeResult;
  }
  return analyzeFile(file);
});

ipcMain.handle(IPC.version, () => app.getVersion());

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.github.pixelmon770.osutrainer');
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
