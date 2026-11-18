// Obserwowanie folderów z replayami. Gdy pojawi się nowy plik .osr, czekamy,
// aż osu! skończy go zapisywać, i analizujemy go w tle – po kolei, jeden na raz.

import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

type Handler = (file: string) => Promise<void>;

const SETTLE_MS = 700;

export class ReplayWatcher {
  private watchers: FSWatcher[] = [];
  private pending = new Map<string, NodeJS.Timeout>();
  private queue: string[] = [];
  private running = false;
  /** pliki już obsłużone w tej sesji (ścieżka + rozmiar), żeby nie analizować dwa razy */
  private seen = new Set<string>();
  private readonly handler: Handler;

  constructor(handler: Handler) {
    this.handler = handler;
  }

  start(folders: string[]): void {
    this.stop();
    for (const folder of folders) {
      try {
        const w = watch(folder, (_event, name) => {
          if (name && name.toString().toLowerCase().endsWith('.osr')) this.schedule(join(folder, name.toString()));
        });
        w.on('error', () => w.close());
        this.watchers.push(w);
      } catch {
        // folder nie istnieje albo brak dostępu – pomijamy
      }
    }
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }

  private schedule(file: string): void {
    const old = this.pending.get(file);
    if (old) clearTimeout(old);
    this.pending.set(
      file,
      setTimeout(() => {
        this.pending.delete(file);
        void this.whenStable(file);
      }, SETTLE_MS)
    );
  }

  /** Rozmiar pliku musi się przestać zmieniać – osu! może jeszcze pisać. */
  private async whenStable(file: string): Promise<void> {
    let last = -1;
    for (let i = 0; i < 20; i++) {
      const s = await stat(file).catch(() => null);
      if (!s) return; // plik usunięty
      if (s.size > 0 && s.size === last) {
        const key = `${file}|${s.size}`;
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.queue.push(file);
        void this.drain();
        return;
      }
      last = s.size;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const file = this.queue.shift()!;
      await this.handler(file).catch(() => undefined);
    }
    this.running = false;
  }
}
