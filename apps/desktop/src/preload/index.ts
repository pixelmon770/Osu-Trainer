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
  version: () => ipcRenderer.invoke(IPC.version)
};

contextBridge.exposeInMainWorld('api', api);
