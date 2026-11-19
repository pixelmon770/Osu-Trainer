// Statystyki z historii replayów: wybrany okres, porównanie z poprzednim, trend w dniach/tygodniach,
// zestawienie według BPM streamów i najczęściej grane mapy.

import { readFile } from 'node:fs/promises';
import { analyzeMapText } from '@osu-trainer/analyzer';
import type { ReplaySummary, StatsBucket, StatsQuery, StatsResult, StatsTotals } from '../shared/api.ts';
import { missingStreamBpm, queryReplays, setStreamBpm } from './history.ts';

const DAY = 86_400_000;

/** Uzupełnia BPM streamów we wpisach ze starszych wersji programu (w tle, raz). */
export async function backfillStreamBpm(): Promise<number> {
  let done = 0;
  for (;;) {
    const batch = await missingStreamBpm(200);
    if (batch.length === 0) return done;
    // jeden plik mapy = jedno liczenie, nawet przy wielu próbach
    const byMap = new Map<string, string[]>();
    for (const r of batch) byMap.set(r.mapFile, [...(byMap.get(r.mapFile) ?? []), r.id]);
    for (const [mapFile, ids] of byMap) {
      let bpm = -1;
      try {
        bpm = Math.round(analyzeMapText(await readFile(mapFile, 'utf8')).streams.bpm);
      } catch {
        // mapa usunięta albo przeniesiona – oznaczamy, żeby nie próbować w kółko
      }
      await setStreamBpm(ids, bpm);
      done += ids.length;
    }
  }
}

const mean = (list: ReplaySummary[], pick: (s: ReplaySummary) => number): number =>
  list.length ? list.reduce((s, x) => s + pick(x), 0) / list.length : 0;

/** Średnie tylko z prób, w których dana miara ma sens (np. wejście w stream tylko na mapach ze streamami). */
const meanWhere = (list: ReplaySummary[], ok: (s: ReplaySummary) => boolean, pick: (s: ReplaySummary) => number): number | null => {
  const l = list.filter(ok);
  return l.length ? mean(l, pick) : null;
};

const hasStreams = (s: ReplaySummary) => (s.streamBpm ?? 0) > 0 && s.streamUr > 0;

function totals(list: ReplaySummary[]): StatsTotals {
  return {
    plays: list.length,
    accuracy: mean(list, (s) => s.accuracy),
    ur: mean(list, (s) => s.ur),
    k2k1: mean(list, (s) => s.k2Mean - s.k1Mean),
    streamUr: meanWhere(list, hasStreams, (s) => s.streamUr),
    entry: meanWhere(list, hasStreams, (s) => s.entryMean),
    misses: mean(list, (s) => s.countMiss)
  };
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return localDayKey(monday.toISOString());
}

const BPM_BUCKETS: [string, number, number][] = [
  ['<160', 1, 159],
  ['160–179', 160, 179],
  ['180–199', 180, 199],
  ['200–219', 200, 219],
  ['220–239', 220, 239],
  ['240+', 240, Infinity]
];

export async function computeStats(q: StatsQuery): Promise<StatsResult> {
  const base = { mods: q.mods, source: q.source, hidePartial: q.hidePartial, limit: 5000, sort: 'oldest' as const };
  // bieżący okres + poprzedni tej samej długości (do porównania)
  const all = (await queryReplays({ ...base, sinceDays: q.sinceDays ? q.sinceDays * 2 : null })).items;
  const cutoff = q.sinceDays ? Date.now() - q.sinceDays * DAY : -Infinity;
  const current = all.filter((s) => new Date(s.playedAt).getTime() >= cutoff);
  const previous = q.sinceDays ? all.filter((s) => new Date(s.playedAt).getTime() < cutoff) : [];

  // trend: dni, a przy długim okresie tygodnie
  const spanDays = current.length ? (Date.now() - new Date(current[0]!.playedAt).getTime()) / DAY : 0;
  const granularity: StatsResult['granularity'] = spanDays > 60 ? 'week' : 'day';
  const groups = new Map<string, ReplaySummary[]>();
  for (const s of current) {
    const key = granularity === 'week' ? weekKey(s.playedAt) : localDayKey(s.playedAt);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const buckets: StatsBucket[] = [...groups.entries()].map(([key, list]) => ({ key, ...totals(list) }));

  const byBpm = BPM_BUCKETS.map(([range, lo, hi]) => {
    const list = current.filter((s) => hasStreams(s) && s.streamBpm! >= lo && s.streamBpm! <= hi);
    return { range, ...totals(list) };
  }).filter((b) => b.plays > 0);

  const maps = new Map<string, ReplaySummary[]>();
  for (const s of current) maps.set(s.beatmapMd5, [...(maps.get(s.beatmapMd5) ?? []), s]);
  const topMaps = [...maps.values()]
    .filter((list) => list.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
    .map((list) => {
      const n = Math.min(3, Math.floor(list.length / 2));
      return {
        beatmapMd5: list[0]!.beatmapMd5,
        title: list[0]!.title,
        version: list[0]!.version,
        artist: list[0]!.artist,
        attempts: list.length,
        bestAccuracy: Math.max(...list.map((s) => s.accuracy)),
        accuracyChange: n ? mean(list.slice(-n), (s) => s.accuracy) - mean(list.slice(0, n), (s) => s.accuracy) : 0,
        urChange: n ? mean(list.slice(-n), (s) => s.ur) - mean(list.slice(0, n), (s) => s.ur) : 0
      };
    });

  return {
    period: totals(current),
    previous: previous.length ? totals(previous) : null,
    granularity,
    buckets,
    byBpm,
    topMaps,
    missingBpm: current.filter((s) => s.streamBpm === null).length
  };
}
