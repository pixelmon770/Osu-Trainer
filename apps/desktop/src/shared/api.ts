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
  /** BPM streamów mapy (0 = bez streamów, null = nie policzono) */
  streamBpm: number | null;
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

export interface StatsQuery {
  /** ostatnie N dni; null = cała historia */
  sinceDays: number | null;
  mods?: string | null;
  source?: 'all' | ReplaySource;
  hidePartial?: boolean;
}

/** Średnie z prób (null = brak prób, w których miara ma sens, np. streamów). */
export interface StatsTotals {
  plays: number;
  accuracy: number;
  ur: number;
  /** K2 − K1 w ms (dodatnie = K2 później) */
  k2k1: number;
  streamUr: number | null;
  /** wejście w stream: średni błąd pierwszej nuty streamu */
  entry: number | null;
  misses: number;
}

export interface StatsBucket extends StatsTotals {
  /** dzień (RRRR-MM-DD) albo poniedziałek tygodnia */
  key: string;
}

export interface StatsResult {
  period: StatsTotals;
  /** poprzedni okres tej samej długości (null przy „cały czas” albo braku gier) */
  previous: StatsTotals | null;
  granularity: 'day' | 'week';
  buckets: StatsBucket[];
  byBpm: (StatsTotals & { range: string })[];
  topMaps: {
    beatmapMd5: string;
    title: string;
    version: string;
    artist: string;
    attempts: number;
    bestAccuracy: number;
    /** średnia z ostatnich prób minus średnia z pierwszych */
    accuracyChange: number;
    urChange: number;
  }[];
  /** próby, dla których jeszcze liczy się BPM streamów */
  missingBpm: number;
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
  /** klawisze w ćwiczeniach (KeyboardEvent.code), np. KeyZ / KeyX */
  keyK1: string;
  keyK2: string;
  /** opóźnienie dźwięku z kalibracji (ms): o tyle przesuwamy tapnięcia */
  audioOffsetMs: number;
  /** głośność metronomu 0–1 */
  volume: number;
  /** OD ćwiczeń: okna 300/100/50 */
  drillOd: number;
}

export interface DrillRecord {
  id: string;
  createdAt: string;
  /** rhythm = Rytm i metronom, trainer = Trener kliknięć */
  kind: 'rhythm' | 'trainer';
  /** ćwiczenie / tryb, np. single-stroke, burst-ladder, map:<md5> */
  name: string;
  /** opis do listy, np. nazwa mapy */
  label: string;
  bpm: number;
  durationMs: number;
  notes: number;
  accuracy: number;
  misses: number;
  extraTaps: number;
  wrongFinger: number;
  ur: number;
  mean: number;
  k1Mean: number;
  k2Mean: number;
  k1Ur: number;
  k2Ur: number;
  entryMean: number;
  tapSpread: number;
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
  /** Statystyki z historii replayów. */
  stats(q: StatsQuery): Promise<StatsResult>;
  /** Zapis wyniku ćwiczenia. */
  saveDrill(r: Omit<DrillRecord, 'id' | 'createdAt'>): Promise<DrillRecord>;
  /** Wyniki ćwiczeń (najnowsze pierwsze); name = tylko jedno ćwiczenie. */
  listDrills(kind: DrillRecord['kind'], name?: string | null, limit?: number): Promise<DrillRecord[]>;
  /** Wczytuje mapę .osu (okno wyboru) i zwraca jej tekst – dla trybu „streamy z mapy”. */
  pickMapText(labels: DialogLabels): Promise<{ file: string; text: string } | null>;
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
  stats: 'history:stats',
  saveDrill: 'drills:save',
  listDrills: 'drills:list',
  pickMapText: 'map:pick-text',
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
