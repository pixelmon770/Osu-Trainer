// Wspólne typy dla procesu głównego, preloadu i interfejsu.

import type { MapAnalysis } from '@osu-trainer/analyzer';

export type { MapAnalysis };

export type AnalyzeResult =
  | { ok: true; file: string; analysis: MapAnalysis }
  | { ok: false; file?: string; error: string }
  | null; // użytkownik zamknął okno wyboru pliku

export interface TrainerApi {
  /** Otwiera okno wyboru pliku .osu i zwraca analizę. */
  pickAndAnalyzeMap(): Promise<AnalyzeResult>;
  /** Analizuje plik o podanej ścieżce (np. przeciągnięty do okna). */
  analyzeMapFile(path: string): Promise<AnalyzeResult>;
  /** Ścieżka do przeciągniętego pliku. */
  pathForFile(file: File): string;
  /** Wersja aplikacji. */
  version(): Promise<string>;
}

export const IPC = {
  pickAndAnalyzeMap: 'map:pick-and-analyze',
  analyzeMapFile: 'map:analyze-file',
  version: 'app:version'
} as const;
