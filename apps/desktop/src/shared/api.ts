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
  | { ok: true; id: string; replayFile: string; mapFile: string; beatmapMd5: string; map: MapInfo; analysis: ReplayAnalysis }
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
  beatmapMd5: string;
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
  /** średni błąd na pierwszej nucie streamów (wejście w burst) */
  entryMean: number;
  alternation: number;
  tapSpread: number;
  partial: boolean;
  /** z którego klienta pochodzi replay */
  source: ReplaySource;
}

export type ReplaySource = 'stable' | 'lazer' | 'file';

export interface ReplayFilter {
  /** szuka w tytule, artyście, nazwie poziomu i mapperze */
  search?: string;
  /** tylko jedna mapa (poziom trudności) */
  beatmapMd5?: string | null;
  source?: 'all' | ReplaySource;
  /** ostatnie N dni; null = wszystko */
  sinceDays?: number | null;
  /** dokładny zestaw modów, np. "HD,DT"; "NM" = bez modów; null = dowolne */
  mods?: string | null;
  /** ukryj próby przerwane (quit/fail) */
  hidePartial?: boolean;
  sort?: 'newest' | 'oldest' | 'accuracy' | 'ur';
  limit?: number;
}

/** Mapa w historii z podsumowaniem prób. */
export interface MapGroup {
  beatmapMd5: string;
  artist: string;
  title: string;
  version: string;
  attempts: number;
  lastPlayed: string;
  bestAccuracy: number;
  bestUr: number;
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
  /** folder danych osu!lazer (np. %APPDATA%\osu) */
  lazerFolder: string | null;
  /** obserwuj magazyn plików lazera (nowe replaye, także faile) */
  watchLazer: boolean;
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
  kind: 'data-r' | 'replays' | 'lazer' | 'extra';
  enabled: boolean;
  exists: boolean;
}

export interface SettingsStatus {
  settings: Settings;
  osuFolderFound: boolean;
  songsFolder: string | null;
  osuDb: { maps: number; player: string; error: string | null } | null;
  lazer: { found: boolean; indexedMaps: number; indexing: boolean };
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
  /** przejrzane foldery i ile znaleziono w nich replayów z wybranego okresu */
  folders: { path: string; kind: WatchedFolder['kind']; found: number }[];
}

export interface TrainerApi {
  pickAndAnalyzeMap(labels: DialogLabels): Promise<AnalyzeResult>;
  analyzeMapFile(path: string): Promise<AnalyzeResult>;
  /** Otwiera okno wyboru replaya .osr; mapę znajduje sam albo pyta o nią. Wynik trafia do historii. */
  pickAndAnalyzeReplay(labels: DialogLabels): Promise<ReplayResult>;
  analyzeReplayFile(path: string, mapHint: string | null, labels: DialogLabels): Promise<ReplayResult>;
  /** Historia analiz z filtrami. */
  queryReplays(filter: ReplayFilter): Promise<{ items: ReplaySummary[]; total: number }>;
  /** Mapy w historii (te same filtry, bez sortowania i wyboru mapy). */
  listMaps(filter: ReplayFilter): Promise<MapGroup[]>;
  /** Zestawy modów występujące w historii (do filtra). */
  modCombos(): Promise<string[]>;
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
  queryReplays: 'history:query',
  listMaps: 'history:maps',
  modCombos: 'history:mods',
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
