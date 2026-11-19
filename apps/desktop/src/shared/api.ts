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

export interface SessionSummary {
  id: string;
  start: string;
  end: string;
  durationMs: number;
  plays: number;
  drills: number;
  maps: number;
  accuracy: number | null;
  ur: number | null;
  k2k1: number | null;
  streamUr: number | null;
  /** pierwsze 3 gry wobec reszty (od 6 gier) */
  warmup: { firstUr: number; restUr: number } | null;
  /** ostatnia trzecia część sesji wobec środkowej (od 9 gier) */
  fatigue: { middleUr: number; endUr: number } | null;
  drillUr: number | null;
  best: { id: string; title: string; version: string; accuracy: number } | null;
  playIds: string[];
}

/** Podpowiedź „co dziś trenować” – z gotowymi ustawieniami ćwiczenia. */
export interface Recommendation {
  id: string;
  reason: 'noData' | 'keyGap' | 'keyGapEven' | 'entry' | 'streamUr' | 'fatigue' | 'maintain';
  value?: number;
  screen: 'rhythm' | 'trainer';
  exercise?: string;
  mode?: 'ladder' | 'stream';
  bpm: number;
  length?: number;
  seconds?: number;
}

export interface DashboardTotals {
  plays: number;
  accuracy: number | null;
  ur: number | null;
  k2k1: number | null;
}

export interface DashboardData {
  today: DashboardTotals & { drills: number };
  week: DashboardTotals;
  previousWeek: DashboardTotals | null;
  latest: ReplaySummary[];
  lastSession: SessionSummary | null;
  recommendations: Recommendation[];
  recentDrills: DrillRecord[];
  /** dni z rzędu z grą albo ćwiczeniem */
  streak: number;
}

export interface PlaybackObject {
  /** numer w analizie (bez spinnerów); -1 = spinner */
  noteIndex: number;
  kind: 'circle' | 'slider' | 'spinner';
  time: number;
  endTime: number;
  /** pozycja po stosach i HR */
  x: number;
  y: number;
  slides: number;
  path?: { x: number; y: number }[];
  /** numer w combo i numer combo (do kolorów) */
  combo: number;
  comboIndex: number;
}

export interface PlaybackData {
  /** [czas, x, y, klawisze] */
  frames: [number, number, number, number][];
  objects: PlaybackObject[];
  radius: number;
  preempt: number;
  hidden: boolean;
  mods: string[];
  title: string;
  analysis: ReplayAnalysis;
}

export interface AiExportOptions {
  days: number;
  /** ile ostatnich gier w tabeli */
  replays: number;
  /** ile ostatnich gier ze szczegółową analizą */
  details: number;
}

export interface McpInfo {
  /** gotowy fragment konfiguracji Claude Desktop */
  config: string;
  claudeConfigPath: string;
  /** czy folder Claude Desktop istnieje */
  claudeFound: boolean;
  /** czy serwer osu! Trenera jest już w konfiguracji */
  installed: boolean;
  tools: { name: string; description: string }[];
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
  /** Roadmapa: status umiejętności ustawiony przez gracza (id węzła → mocne/ok/slabe/brak) */
  roadmap: Record<string, string>;
  /** Cele i zadania (ekran Plan i Cele) */
  goals: Goal[];
  todos: Todo[];
}

export type GoalMetric = 'ur' | 'k2k1' | 'accuracy' | 'streamUr' | 'entry' | 'plays' | 'drills' | 'mapAccuracy';

export interface Goal {
  id: string;
  metric: GoalMetric;
  /** wartość docelowa (dla k2k1 i entry: |wartość| ≤ cel) */
  target: number;
  /** z ilu ostatnich dni liczyć */
  days: number;
  /** dla mapAccuracy: która mapa */
  beatmapMd5?: string;
  mapLabel?: string;
  createdAt: string;
  /** ustawione, gdy cel został osiągnięty */
  doneAt?: string;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  /** dni tygodnia 0–6 (pon–nd), w które zadanie się powtarza; pusta lista = jednorazowe */
  repeat: number[];
  createdAt: string;
  /** ostatni dzień odhaczenia (RRRR-MM-DD) – zadania powtarzalne odhaczają się na dany dzień */
  doneOn?: string;
}

export interface GoalProgress {
  goal: Goal;
  /** obecna wartość (null = za mało danych) */
  current: number | null;
  /** 0–1, jak blisko celu */
  progress: number;
  reached: boolean;
  samples: number;
}

export interface DrillRecord {
  id: string;
  createdAt: string;
  /** rhythm = Rytm i metronom, trainer = Trener kliknięć, aim = Skoki – trener aimu */
  kind: 'rhythm' | 'trainer' | 'aim';
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
  /** tylko trener aimu: średnia odległość od środka i przestrzał (w promieniach), % trafień */
  aimDistance?: number | null;
  aimOvershoot?: number | null;
  hitRate?: number | null;
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

// ---------- Biblioteka map ----------

export interface LibraryMap {
  md5: string;
  source: 'stable' | 'lazer';
  title: string;
  artist: string;
  version: string;
  creator: string;
  beatmapId: number | null;
  setId: number | null;
  /** gwiazdki bez modów z osu!.db (lazer: brak) */
  stars: number | null;
  /** BPM, w którym leci większość mapy */
  bpm: number;
  lengthMs: number;
  ar: number;
  od: number;
  cs: number;
  objects: number;
  streamBpm: number | null;
  /** % obiektów w streamach */
  streamPct: number;
  longestStream: number;
  longestBlockMs: number;
  streamSpacing: number | null;
  /** skoki na 1/2 dłuższe niż 3 średnice, na minutę */
  jumpsPerMin: number;
  /** średnia odległość przejść na 1/2, w średnicach */
  jumpDistance: number;
  overlapPct: number;
  /** Twoje próby na tej mapie */
  attempts: number;
  bestAccuracy: number | null;
}

export type Range = [number | null, number | null];

export interface LibraryQuery {
  search?: string;
  stars?: Range;
  bpm?: Range;
  streamBpm?: Range;
  lengthS?: Range;
  ar?: Range;
  od?: Range;
  cs?: Range;
  longestBlockS?: Range;
  longestStream?: Range;
  streamSpacing?: Range;
  streamPct?: Range;
  jumpsPerMin?: Range;
  jumpDistance?: Range;
  overlapPct?: Range;
  source?: 'stable' | 'lazer' | null;
  played?: 'any' | 'played' | 'new';
  sort?: 'title' | 'stars' | 'bpm' | 'streamBpm' | 'block' | 'jumps' | 'length' | 'attempts';
  desc?: boolean;
  limit?: number;
  offset?: number;
}

export interface LibraryStatus {
  running: boolean;
  /** przejrzane mapy w bieżącym indeksowaniu */
  done: number;
  total: number;
  /** mapy osu!standard w bibliotece */
  maps: number;
  failed: number;
}

/** Twój obecny poziom wyliczony z ostatnich gier (podstawa doboru map). */
export interface PlayerProfile {
  plays: number;
  /** tempo streamów, które grasz równo */
  streamBpm: number | null;
  /** najdłuższe bloki streamów, które kończysz z dobrą celnością (s) */
  blockS: number | null;
  stars: number | null;
  ar: number | null;
  jumpDistance: number | null;
}

export interface LadderStep {
  map: LibraryMap;
  /** 1 … n; ostatni krok to mapa-cel */
  step: number;
  /** jak daleko od Twojego poziomu do celu (0–1) */
  share: number;
}

export interface LadderResult {
  target: LibraryMap | null;
  /** po czym dobierano: streamy, skoki albo ogólnie */
  basis: 'streams' | 'jumps' | 'general';
  steps: LadderStep[];
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
  dashboard(): Promise<DashboardData>;
  goalsProgress(): Promise<GoalProgress[]>;
  aiExport(o: AiExportOptions): Promise<string>;
  /** zapisuje tekst do pliku .md (okno zapisu); zwraca ścieżkę albo null */
  saveText(text: string, defaultName: string): Promise<string | null>;
  mcpInfo(): Promise<McpInfo>;
  installMcp(): Promise<McpInfo>;
  uninstallMcp(): Promise<McpInfo>;
  copyText(text: string): Promise<void>;
  /** Klatki i obiekty do Analizatora klatek (czyta pliki replaya i mapy z dysku). */
  playback(id: string): Promise<PlaybackData | { error: string }>;
  sessions(sinceDays: number | null): Promise<SessionSummary[]>;
  /** Zapis wyniku ćwiczenia. */
  saveDrill(r: Omit<DrillRecord, 'id' | 'createdAt'>): Promise<DrillRecord>;
  /** Wyniki ćwiczeń (najnowsze pierwsze); name = tylko jedno ćwiczenie. */
  listDrills(kind: DrillRecord['kind'], name?: string | null, limit?: number): Promise<DrillRecord[]>;
  /** Wczytuje mapę .osu (okno wyboru) i zwraca jej tekst – dla trybu „streamy z mapy”. */
  pickMapText(labels: DialogLabels): Promise<{ file: string; text: string } | null>;
  /** Biblioteka map: lokalne mapy z osu!.db i lazera z analizą streamów, skoków i czytania. */
  queryLibrary(q: LibraryQuery): Promise<{ items: LibraryMap[]; total: number }>;
  libraryStatus(): Promise<LibraryStatus>;
  /** Ponowne przejrzenie map (np. po pobraniu nowych); force = przeanalizuj wszystko od nowa. */
  reindexLibrary(force?: boolean): Promise<void>;
  playerProfile(): Promise<PlayerProfile>;
  mapLadder(md5: string, steps?: number): Promise<LadderResult>;
  /** Tekst mapy z biblioteki (dla trenera „streamy z mapy”). */
  libraryMapText(md5: string): Promise<{ file: string; text: string } | null>;
  analyzeLibraryMap(md5: string): Promise<AnalyzeResult>;
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
  dashboard: 'history:dashboard',
  goalsProgress: 'goals:progress',
  aiExport: 'ai:export',
  saveText: 'app:save-text',
  mcpInfo: 'ai:mcp-info',
  installMcp: 'ai:mcp-install',
  uninstallMcp: 'ai:mcp-uninstall',
  copyText: 'app:copy-text',
  playback: 'replay:playback',
  sessions: 'history:sessions',
  saveDrill: 'drills:save',
  listDrills: 'drills:list',
  pickMapText: 'map:pick-text',
  queryLibrary: 'library:query',
  libraryStatus: 'library:status',
  reindexLibrary: 'library:reindex',
  playerProfile: 'library:profile',
  mapLadder: 'library:ladder',
  libraryMapText: 'library:map-text',
  analyzeLibraryMap: 'library:analyze',
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
