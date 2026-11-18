// Most między interfejsem a procesem głównym. Interfejs nie ma bezpośredniego dostępu
// do plików ani Node.js – może wywołać tylko funkcje wystawione tutaj jako window.api.

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type TrainerApi } from '../shared/api.ts';

const api: TrainerApi = {
  pickAndAnalyzeMap: () => ipcRenderer.invoke(IPC.pickAndAnalyzeMap),
  analyzeMapFile: (path) => ipcRenderer.invoke(IPC.analyzeMapFile, path),
  pathForFile: (file) => webUtils.getPathForFile(file),
  version: () => ipcRenderer.invoke(IPC.version)
};

contextBridge.exposeInMainWorld('api', api);
