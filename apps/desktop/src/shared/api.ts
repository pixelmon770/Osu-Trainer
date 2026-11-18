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
  | { ok: true; replayFile: string; mapFile: string; map: MapInfo; analysis: ReplayAnalysis }
  | {
      ok: false;
      /** not-osr-file | map-not-selected | map-mismatch | other-mode | błąd odczytu */
      error: string;
      replayFile?: string;
    }
  | null;

/** Teksty okien systemowych – w języku wybranym w programie. */
export interface DialogLabels {
  pickMap?: string;
  pickReplay?: string;
  pickMapForReplay?: string;
}

export interface TrainerApi {
  /** Otwiera okno wyboru pliku .osu i zwraca analizę. */
  pickAndAnalyzeMap(labels: DialogLabels): Promise<AnalyzeResult>;
  /** Analizuje plik o podanej ścieżce (np. przeciągnięty do okna). */
  analyzeMapFile(path: string): Promise<AnalyzeResult>;
  /** Otwiera okno wyboru replaya .osr; mapę znajduje sam albo pyta o nią. */
  pickAndAnalyzeReplay(labels: DialogLabels): Promise<ReplayResult>;
  /** Analizuje replay o podanej ścieżce; mapHint = przeciągnięty razem plik .osu. */
  analyzeReplayFile(path: string, mapHint: string | null, labels: DialogLabels): Promise<ReplayResult>;
  /** Ścieżka do przeciągniętego pliku. */
  pathForFile(file: File): string;
  /** Wersja aplikacji. */
  version(): Promise<string>;
}

export const IPC = {
  pickAndAnalyzeMap: 'map:pick-and-analyze',
  analyzeMapFile: 'map:analyze-file',
  pickAndAnalyzeReplay: 'replay:pick-and-analyze',
  analyzeReplayFile: 'replay:analyze-file',
  version: 'app:version'
} as const;
