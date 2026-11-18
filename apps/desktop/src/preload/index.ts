// Most między interfejsem a procesem głównym. Interfejs nie ma bezpośredniego dostępu
// do plików ani Node.js – może wywołać tylko funkcje wystawione tutaj jako window.api.

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type TrainerApi } from '../shared/api.ts';

const api: TrainerApi = {
  pickAndAnalyzeMap: (labels) => ipcRenderer.invoke(IPC.pickAndAnalyzeMap, labels),
  analyzeMapFile: (path) => ipcRenderer.invoke(IPC.analyzeMapFile, path),
  pickAndAnalyzeReplay: (labels) => ipcRenderer.invoke(IPC.pickAndAnalyzeReplay, labels),
  analyzeReplayFile: (path, mapHint, labels) => ipcRenderer.invoke(IPC.analyzeReplayFile, path, mapHint, labels),
  pathForFile: (file) => webUtils.getPathForFile(file),
  version: () => ipcRenderer.invoke(IPC.version)
};

contextBridge.exposeInMainWorld('api', api);
