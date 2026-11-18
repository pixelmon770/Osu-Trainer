// Wspólne typy dla procesu głównego, preloadu i interfejsu.

import type { MapAnalysis, ReplayAnalysis } from '@osu-trainer/analyzer';

export type { MapAnalysis, ReplayAnalysis };

export type AnalyzeResult =
  | { ok: true; file: string; analysis: MapAnalysis }
  | { ok: false; file?: string; error: string }
  | null; // użytkownik zamknął okno wyboru pliku

export interface MapInfo {
  title: string;
  artist: string;
  version: string;
  creator: string;
  /** czas ostatniego obiektu mapy w ms */
  endMs: number;
}

export type ReplayResult =
  | { ok: true; id: string; replayFile: string; mapFile: string; map: MapInfo; analysis: ReplayAnalysis }
  | {
      ok: false;
      /** not-osr-file | map-not-selected | map-mismatch | map-not-found | other-mode | błąd odczytu */
      error: string;
      replayFile?: string;
    }
  | null;

/** Krótki wpis w historii replayów (bez szczegółów nuta po nucie). */
export interface ReplaySummary {
  id: string;
  file: string;
  artist: string;
  title: string;
  version: string;
  playedAt: string;
  analyzedAt: string;
  mods: string[];
  accuracy: number;
  countMiss: number;
  maxCombo: number;
  ur: number;
  k1Mean: number;
  k2Mean: number;
  streamUr: number;
  partial: boolean;
}

/** Teksty okien systemowych – w języku wybranym w programie. */
export interface DialogLabels {
  pickMap?: string;
  pickReplay?: string;
  pickMapForReplay?: string;
  pickFolder?: string;
}

export interface Settings {
  /** folder osu!stable, np. C:\Users\…\AppData\Local\osu! */
  osuFolder: string | null;
  /** obserwuj osu!/Data/r (replaye ukończonych prób zapisywane automatycznie) */
  watchDataR: boolean;
  /** obserwuj osu!/Replays (replaye wyeksportowane przez F2) */
  watchReplays: boolean;
  /** dodatkowe foldery z replayami */
  extraFolders: string[];
  /** analizuj nowe replaye od razu po pojawieniu się */
  autoAnalyze: boolean;
  /** powiadomienie systemowe o nowym replayu, gdy program jest w tle */
  notifications: boolean;
  /** uruchamiaj program razem z Windows (tylko wersja zainstalowana) */
  openAtLogin: boolean;
  language: string;
}

export interface WatchedFolder {
  path: string;
  kind: 'data-r' | 'replays' | 'extra';
  enabled: boolean;
  exists: boolean;
}

export interface SettingsStatus {
  settings: Settings;
  osuFolderFound: boolean;
  songsFolder: string | null;
  osuDb: { maps: number; player: string; error: string | null } | null;
  folders: WatchedFolder[];
  /** autostart działa tylko w zainstalowanej wersji */
  canAutostart: boolean;
  historyCount: number;
}

export interface ImportProgress {
  done: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  finished: boolean;
}

export interface TrainerApi {
  pickAndAnalyzeMap(labels: DialogLabels): Promise<AnalyzeResult>;
  analyzeMapFile(path: string): Promise<AnalyzeResult>;
  /** Otwiera okno wyboru replaya .osr; mapę znajduje sam albo pyta o nią. Wynik trafia do historii. */
  pickAndAnalyzeReplay(labels: DialogLabels): Promise<ReplayResult>;
  analyzeReplayFile(path: string, mapHint: string | null, labels: DialogLabels): Promise<ReplayResult>;
  /** Historia analiz, od najnowszych. */
  listReplays(limit: number): Promise<ReplaySummary[]>;
  getReplay(id: string): Promise<ReplayResult>;
  deleteReplay(id: string): Promise<void>;
  /** Analizuje replaye z obserwowanych folderów, których jeszcze nie ma w historii. */
  importReplays(days: number, limit: number): Promise<ImportProgress>;

  getSettings(): Promise<SettingsStatus>;
  updateSettings(patch: Partial<Settings>): Promise<SettingsStatus>;
  pickFolder(labels: DialogLabels): Promise<string | null>;
  openPath(path: string): Promise<void>;

  /** Zdarzenia z procesu głównego; zwraca funkcję wyłączającą nasłuch. */
  onReplayAdded(cb: (summary: ReplaySummary) => void): () => void;
  onReplayFailed(cb: (info: { file: string; error: string }) => void): () => void;
  onImportProgress(cb: (p: ImportProgress) => void): () => void;

  pathForFile(file: File): string;
  version(): Promise<string>;
}

export const IPC = {
  pickAndAnalyzeMap: 'map:pick-and-analyze',
  analyzeMapFile: 'map:analyze-file',
  pickAndAnalyzeReplay: 'replay:pick-and-analyze',
  analyzeReplayFile: 'replay:analyze-file',
  listReplays: 'history:list',
  getReplay: 'history:get',
  deleteReplay: 'history:delete',
  importReplays: 'history:import',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  pickFolder: 'settings:pick-folder',
  openPath: 'app:open-path',
  version: 'app:version',
  // zdarzenia: proces główny → interfejs
  replayAdded: 'event:replay-added',
  replayFailed: 'event:replay-failed',
  importProgress: 'event:import-progress'
} as const;
