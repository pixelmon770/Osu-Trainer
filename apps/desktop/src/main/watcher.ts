// Obserwowanie folderów z replayami. Gdy pojawi się nowy plik, czekamy,
// aż osu! skończy go zapisywać, i przekazujemy go dalej – po kolei, jeden na raz.
// Foldery stable: pliki .osr. Magazyn lazera: pliki bez rozszerzenia w podfolderach (rozpoznawane później po nagłówku).

import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface WatchTarget {
  path: string;
  /** magazyn lazera: podfoldery i pliki bez rozszerzeń */
  lazer: boolean;
}

type Handler = (file: string, lazer: boolean) => Promise<void>;

const SETTLE_MS = 700;

export class ReplayWatcher {
  private watchers: FSWatcher[] = [];
  private pending = new Map<string, NodeJS.Timeout>();
  private queue: { file: string; lazer: boolean }[] = [];
  private running = false;
  /** pliki już obsłużone w tej sesji (ścieżka + rozmiar), żeby nie analizować dwa razy */
  private seen = new Set<string>();
  private readonly handler: Handler;

  constructor(handler: Handler) {
    this.handler = handler;
  }

  start(targets: WatchTarget[]): void {
    this.stop();
    for (const target of targets) {
      try {
        const w = watch(target.path, { recursive: target.lazer }, (_event, name) => {
          if (!name) return;
          const rel = name.toString();
          const base = rel.split(/[\\/]/).pop() ?? '';
          const wanted = target.lazer ? /^[0-9a-f]{64}$/i.test(base) : base.toLowerCase().endsWith('.osr');
          if (wanted) this.schedule(join(target.path, rel), target.lazer);
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

  private schedule(file: string, lazer: boolean): void {
    const old = this.pending.get(file);
    if (old) clearTimeout(old);
    this.pending.set(
      file,
      setTimeout(() => {
        this.pending.delete(file);
        void this.whenStable(file, lazer);
      }, SETTLE_MS)
    );
  }

  /** Rozmiar pliku musi się przestać zmieniać – osu! może jeszcze pisać. */
  private async whenStable(file: string, lazer: boolean): Promise<void> {
    let last = -1;
    for (let i = 0; i < 20; i++) {
      const s = await stat(file).catch(() => null);
      if (!s) return; // plik usunięty
      if (s.size > 0 && s.size === last) {
        const key = `${file}|${s.size}`;
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.queue.push({ file, lazer });
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
      const item = this.queue.shift()!;
      await this.handler(item.file, item.lazer).catch(() => undefined);
    }
    this.running = false;
  }
}
