// Most między interfejsem a procesem głównym. Interfejs nie ma bezpośredniego dostępu
// do plików ani Node.js – może wywołać tylko funkcje wystawione tutaj jako window.api.

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { IPC, type TrainerApi } from '../shared/api.ts';

function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: TrainerApi = {
  pickAndAnalyzeMap: (labels) => ipcRenderer.invoke(IPC.pickAndAnalyzeMap, labels),
  analyzeMapFile: (path) => ipcRenderer.invoke(IPC.analyzeMapFile, path),
  pickAndAnalyzeReplay: (labels) => ipcRenderer.invoke(IPC.pickAndAnalyzeReplay, labels),
  analyzeReplayFile: (path, mapHint, labels) => ipcRenderer.invoke(IPC.analyzeReplayFile, path, mapHint, labels),
  queryReplays: (filter) => ipcRenderer.invoke(IPC.queryReplays, filter),
  listMaps: (filter) => ipcRenderer.invoke(IPC.listMaps, filter),
  modCombos: () => ipcRenderer.invoke(IPC.modCombos),
  stats: (q) => ipcRenderer.invoke(IPC.stats, q),
  dashboard: () => ipcRenderer.invoke(IPC.dashboard),
  goalsProgress: () => ipcRenderer.invoke(IPC.goalsProgress),
  aiExport: (o) => ipcRenderer.invoke(IPC.aiExport, o),
  saveText: (text, name) => ipcRenderer.invoke(IPC.saveText, text, name),
  mcpInfo: () => ipcRenderer.invoke(IPC.mcpInfo),
  installMcp: () => ipcRenderer.invoke(IPC.installMcp),
  uninstallMcp: () => ipcRenderer.invoke(IPC.uninstallMcp),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  playback: (id) => ipcRenderer.invoke(IPC.playback, id),
  sessions: (sinceDays) => ipcRenderer.invoke(IPC.sessions, sinceDays),
  saveDrill: (r) => ipcRenderer.invoke(IPC.saveDrill, r),
  listDrills: (kind, name, limit) => ipcRenderer.invoke(IPC.listDrills, kind, name ?? null, limit ?? 200),
  pickMapText: (labels) => ipcRenderer.invoke(IPC.pickMapText, labels),
  queryLibrary: (q) => ipcRenderer.invoke(IPC.queryLibrary, q),
  libraryStatus: () => ipcRenderer.invoke(IPC.libraryStatus),
  reindexLibrary: (force) => ipcRenderer.invoke(IPC.reindexLibrary, force ?? false),
  playerProfile: () => ipcRenderer.invoke(IPC.playerProfile),
  mapLadder: (md5, steps) => ipcRenderer.invoke(IPC.mapLadder, md5, steps ?? 4),
  libraryMapText: (md5) => ipcRenderer.invoke(IPC.libraryMapText, md5),
  analyzeLibraryMap: (md5) => ipcRenderer.invoke(IPC.analyzeLibraryMap, md5),
  getReplay: (id) => ipcRenderer.invoke(IPC.getReplay, id),
  deleteReplay: (id) => ipcRenderer.invoke(IPC.deleteReplay, id),
  importReplays: (days, limit) => ipcRenderer.invoke(IPC.importReplays, days, limit),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  pickFolder: (labels) => ipcRenderer.invoke(IPC.pickFolder, labels),
  openPath: (path) => ipcRenderer.invoke(IPC.openPath, path),
  onReplayAdded: (cb) => listen(IPC.replayAdded, cb),
  onReplayFailed: (cb) => listen(IPC.replayFailed, cb),
  onImportProgress: (cb) => listen(IPC.importProgress, cb),
  pathForFile: (file) => webUtils.getPathForFile(file),
  version: () => ipcRenderer.invoke(IPC.version),
  relaunch: () => ipcRenderer.invoke(IPC.relaunch)
};

contextBridge.exposeInMainWorld('api', api);
