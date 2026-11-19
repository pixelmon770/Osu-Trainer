// Biblioteka map (SPEC 3.3) z map, które gracz ma u siebie: osu!.db (stable) i magazyn lazera.
// Każda mapa jest analizowana raz (streamy, skoki, czytanie) i trafia do tabeli `maps`;
// przy kolejnych uruchomieniach analizowane są tylko nowe mapy.
// Dobór map („pod Twój poziom”, „drabinka do mapy-celu”) liczy się z Twoich ostatnich gier.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeBeatmap, bpmFromBeatLength, parseBeatmap, type Beatmap } from '@osu-trainer/analyzer';
import type {
  LadderResult,
  LadderStep,
  LibraryMap,
  LibraryQuery,
  LibraryStatus,
  PlayerProfile,
  Range
} from '../shared/api.ts';
import { select, writeMany, type Params } from './history.ts';
import { lazerMaps } from './lazer.ts';
import { loadOsuDb } from './mapIndex.ts';
import { getSettings, songsFolder } from './settings.ts';

/** Wersja analizy – po zmianie algorytmu wszystkie mapy zostaną przeliczone. */
const ALGO = 1;

let status: LibraryStatus = { running: false, done: 0, total: 0, maps: 0, failed: 0 };
let running: Promise<void> | null = null;

interface Source {
  md5: string;
  path: string;
  source: 'stable' | 'lazer';
  stars: number | null;
  beatmapId: number | null;
  setId: number | null;
}

async function sources(): Promise<{ list: Source[]; stableOk: boolean; lazerOk: boolean }> {
  const out = new Map<string, Source>();
  const db = await loadOsuDb().catch(() => null);
  const songs = songsFolder(getSettings().osuFolder);
  const stableOk = !!(db && !db.error && songs && db.standard.length);
  if (stableOk) {
    for (const m of db!.standard) {
      out.set(m.md5, {
        md5: m.md5,
        path: join(songs!, m.folder, m.file),
        source: 'stable',
        stars: m.stars > 0 ? m.stars : null,
        beatmapId: m.beatmapId || null,
        setId: m.setId > 0 ? m.setId : null
      });
    }
  }
  const lazer: Record<string, string> = getSettings().lazerFolder ? await lazerMaps().catch(() => ({})) : {};
  const lazerList = Object.entries(lazer);
  for (const [md5, path] of lazerList) {
    if (!out.has(md5)) out.set(md5, { md5, path, source: 'lazer', stars: null, beatmapId: null, setId: null });
  }
  return { list: [...out.values()], stableOk, lazerOk: lazerList.length > 0 };
}

/** BPM, w którym leci najdłuższa część mapy (między pierwszym a ostatnim obiektem). */
export function mainBpm(beatmap: Beatmap): number {
  const pts = beatmap.timingPoints.filter((p) => p.beatLength > 0);
  if (!pts.length) return 0;
  const objs = beatmap.hitObjects;
  const start = objs[0]?.time ?? 0;
  const end = objs.length ? Math.max(...objs.slice(-20).map((o) => o.endTime ?? o.time)) : start;
  const byLength = new Map<number, number>();
  for (let i = 0; i < pts.length; i++) {
    const from = Math.max(pts[i]!.time, start);
    const to = Math.min(pts[i + 1]?.time ?? Infinity, end);
    // BPM zaokrąglony do 0,5 – drobne różnice zapisu tempa to ta sama prędkość
    const key = Math.round(bpmFromBeatLength(pts[i]!.beatLength) * 2) / 2;
    if (to > from) byLength.set(key, (byLength.get(key) ?? 0) + (to - from));
  }
  if (!byLength.size) return Math.round(bpmFromBeatLength(pts[0]!.beatLength));
  return [...byLength.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

const INSERT = `INSERT OR REPLACE INTO maps (
  md5, path, source, algo, title, artist, version, creator, beatmap_id, set_id, stars, bpm, length_ms,
  ar, od, cs, objects, stream_bpm, stream_pct, longest_stream, longest_block_ms, stream_spacing,
  jumps_per_min, jump_distance, overlap_pct, error, indexed_at
) VALUES (
  $md5, $path, $source, $algo, $title, $artist, $version, $creator, $beatmap_id, $set_id, $stars, $bpm, $length_ms,
  $ar, $od, $cs, $objects, $stream_bpm, $stream_pct, $longest_stream, $longest_block_ms, $stream_spacing,
  $jumps_per_min, $jump_distance, $overlap_pct, $error, $indexed_at
)`;

const EMPTY_ROW = {
  $title: null, $artist: null, $version: null, $creator: null, $bpm: null, $length_ms: null, $ar: null, $od: null,
  $cs: null, $objects: null, $stream_bpm: null, $stream_pct: null, $longest_stream: null, $longest_block_ms: null,
  $stream_spacing: null, $jumps_per_min: null, $jump_distance: null, $overlap_pct: null
};

/** Wiersz tabeli `maps` dla jednej mapy (eksportowane dla testów). */
export function analyzeRow(text: string, src: Source): Params {
  const base = {
    $md5: src.md5,
    $path: src.path,
    $source: src.source,
    $algo: ALGO,
    $beatmap_id: src.beatmapId,
    $set_id: src.setId,
    $stars: src.stars,
    $indexed_at: new Date().toISOString()
  };
  const bm = parseBeatmap(text);
  if (bm.mode !== 0) return { ...base, ...EMPTY_ROW, $error: 'mode' };
  const a = analyzeBeatmap(bm);
  const minutes = Math.max(a.lengthMs / 60000, 0.5);
  const hasStreams = a.streams.notes > 0;
  return {
    ...base,
    $title: a.title,
    $artist: a.artist,
    $version: a.version,
    $creator: a.creator,
    $beatmap_id: src.beatmapId ?? a.beatmapId ?? null,
    $bpm: mainBpm(bm),
    $length_ms: Math.round(a.lengthMs),
    $ar: a.ar,
    $od: a.od,
    $cs: a.cs,
    $objects: a.objects,
    $stream_bpm: hasStreams ? Math.round(a.streams.bpm) : null,
    $stream_pct: Math.round(a.streams.percentOfObjects * 10) / 10,
    $longest_stream: a.streams.longest?.notes ?? 0,
    $longest_block_ms: Math.round(a.streams.longestBlocks[0]?.durationMs ?? 0),
    $stream_spacing: hasStreams ? Math.round(a.streams.spacing * 100) / 100 : null,
    $jumps_per_min: Math.round((a.jumps.jumpsOver3Diameters / minutes) * 10) / 10,
    $jump_distance: Math.round(a.jumps.averageHalfBeatDistance * 100) / 100,
    $overlap_pct: Math.round(a.reading.overlapPercent * 10) / 10,
    $error: null
  };
}

const yieldToEvents = () => new Promise<void>((r) => setImmediate(r));

async function countMaps(): Promise<number> {
  return Number((await select('SELECT COUNT(*) AS n FROM maps WHERE error IS NULL'))[0]?.n ?? 0);
}

/** Przegląda lokalne mapy w tle; analizuje tylko nowe (albo wszystkie przy force). */
export function indexLibrary(force = false): Promise<void> {
  running ??= (async () => {
    status = { running: true, done: 0, total: 0, maps: await countMaps(), failed: 0 };
    const { list, stableOk, lazerOk } = await sources();
    const known = new Map(
      (await select('SELECT md5, algo, path, stars FROM maps')).map((r) => [r.md5 as string, r] as const)
    );

    // mapy, których już nie ma (usunięte w osu!) – tylko gdy dane źródło dało się odczytać
    const present = new Set(list.map((m) => m.md5));
    const gone: Params[] = [];
    for (const [md5, r] of known) {
      if (present.has(md5)) continue;
      const src = String(r.path).toLowerCase().endsWith('.osu') ? 'stable' : 'lazer';
      if ((src === 'stable' && stableOk) || (src === 'lazer' && lazerOk)) gone.push({ $md5: md5 });
    }
    await writeMany('DELETE FROM maps WHERE md5 = $md5', gone);

    // gwiazdki osu! liczy z opóźnieniem – dopisujemy je do już znanych map
    const stars: Params[] = [];
    for (const m of list) {
      const k = known.get(m.md5);
      if (k && m.stars !== null && k.stars !== m.stars) stars.push({ $md5: m.md5, $stars: m.stars });
    }
    await writeMany('UPDATE maps SET stars = $stars WHERE md5 = $md5', stars);

    const todo = list.filter((m) => {
      const k = known.get(m.md5);
      return force || !k || k.algo !== ALGO || k.path !== m.path;
    });
    status.total = todo.length;
    let batch: Params[] = [];
    for (const m of todo) {
      let row: Params;
      try {
        if (!existsSync(m.path)) throw new Error('missing');
        row = analyzeRow(await readFile(m.path, 'utf8'), m);
      } catch (e) {
        status.failed++;
        row = {
          $md5: m.md5, $path: m.path, $source: m.source, $algo: ALGO, $beatmap_id: m.beatmapId, $set_id: m.setId,
          $stars: m.stars, ...EMPTY_ROW, $error: (e as Error).message.slice(0, 200), $indexed_at: new Date().toISOString()
        };
      }
      batch.push(row);
      status.done++;
      if (batch.length >= 40) {
        await writeMany(INSERT, batch);
        batch = [];
        status.maps = await countMaps();
      }
      // co kilka map oddajemy czas reszcie programu (okno, obserwator replayów)
      if (status.done % 4 === 0) await yieldToEvents();
    }
    await writeMany(INSERT, batch);
    status.maps = await countMaps();
  })()
    .catch((e) => console.error('Biblioteka map:', e))
    .finally(() => {
      status.running = false;
      running = null;
    });
  return running;
}

export async function libraryStatus(): Promise<LibraryStatus> {
  if (!status.running) status.maps = await countMaps();
  return { ...status };
}

// ---------- zapytania ----------

const PLAYS = `LEFT JOIN (
  SELECT beatmap_md5, COUNT(*) AS attempts, MAX(CASE WHEN partial = 0 THEN accuracy END) AS best
  FROM replays GROUP BY beatmap_md5
) r ON r.beatmap_md5 = m.md5`;

const SORT: Record<NonNullable<LibraryQuery['sort']>, string> = {
  title: 'lower(m.title)',
  stars: 'm.stars',
  bpm: 'm.bpm',
  streamBpm: 'm.stream_bpm',
  block: 'm.longest_block_ms',
  jumps: 'm.jumps_per_min',
  length: 'm.length_ms',
  attempts: 'attempts'
};

function toMap(r: Record<string, unknown>): LibraryMap {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    md5: r.md5 as string,
    source: r.source as LibraryMap['source'],
    title: (r.title as string) ?? '',
    artist: (r.artist as string) ?? '',
    version: (r.version as string) ?? '',
    creator: (r.creator as string) ?? '',
    beatmapId: n(r.beatmap_id),
    setId: n(r.set_id),
    stars: n(r.stars),
    bpm: Number(r.bpm ?? 0),
    lengthMs: Number(r.length_ms ?? 0),
    ar: Number(r.ar ?? 0),
    od: Number(r.od ?? 0),
    cs: Number(r.cs ?? 0),
    objects: Number(r.objects ?? 0),
    streamBpm: n(r.stream_bpm),
    streamPct: Number(r.stream_pct ?? 0),
    longestStream: Number(r.longest_stream ?? 0),
    longestBlockMs: Number(r.longest_block_ms ?? 0),
    streamSpacing: n(r.stream_spacing),
    jumpsPerMin: Number(r.jumps_per_min ?? 0),
    jumpDistance: Number(r.jump_distance ?? 0),
    overlapPct: Number(r.overlap_pct ?? 0),
    attempts: Number(r.attempts ?? 0),
    bestAccuracy: n(r.best)
  };
}

/** Warunki WHERE dla filtrów (eksportowane dla testów). */
export function whereFor(q: LibraryQuery): { sql: string; params: Params } {
  const parts = ['m.error IS NULL'];
  const params: Params = {};
  let i = 0;
  const range = (expr: string, r: Range | undefined, scale = 1) => {
    if (!r) return;
    const [lo, hi] = r;
    if (lo !== null && Number.isFinite(lo)) {
      parts.push(`${expr} >= $p${i}`);
      params[`$p${i++}`] = lo * scale;
    }
    if (hi !== null && Number.isFinite(hi)) {
      parts.push(`${expr} <= $p${i}`);
      params[`$p${i++}`] = hi * scale;
    }
  };
  range('m.stars', q.stars);
  range('m.bpm', q.bpm);
  range('m.stream_bpm', q.streamBpm);
  range('m.length_ms', q.lengthS, 1000);
  range('m.ar', q.ar);
  range('m.od', q.od);
  range('m.cs', q.cs);
  range('m.longest_block_ms', q.longestBlockS, 1000);
  range('m.longest_stream', q.longestStream);
  range('m.stream_spacing', q.streamSpacing);
  range('m.stream_pct', q.streamPct);
  range('m.jumps_per_min', q.jumpsPerMin);
  range('m.jump_distance', q.jumpDistance);
  range('m.overlap_pct', q.overlapPct);
  if (q.source) {
    parts.push('m.source = $source');
    params.$source = q.source;
  }
  if (q.played === 'played') parts.push('COALESCE(attempts, 0) > 0');
  if (q.played === 'new') parts.push('COALESCE(attempts, 0) = 0');
  const words = (q.search ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  words.forEach((w, k) => {
    parts.push(`instr(lower(m.title || ' ' || m.artist || ' ' || m.version || ' ' || m.creator), $w${k}) > 0`);
    params[`$w${k}`] = w;
  });
  return { sql: parts.join(' AND '), params };
}

export async function queryLibrary(q: LibraryQuery): Promise<{ items: LibraryMap[]; total: number }> {
  const { sql, params } = whereFor(q);
  const sort = SORT[q.sort ?? 'title'] ?? SORT.title;
  const dir = q.desc ? 'DESC' : 'ASC';
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
  const offset = Math.max(q.offset ?? 0, 0);
  const items = await select(
    `SELECT m.*, r.attempts AS attempts, r.best AS best FROM maps m ${PLAYS}
     WHERE ${sql} ORDER BY (${sort} IS NULL), ${sort} ${dir}, lower(m.title), m.version LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const total = Number((await select(`SELECT COUNT(*) AS n FROM maps m ${PLAYS} WHERE ${sql}`, params))[0]?.n ?? 0);
  return { items: items.map(toMap), total };
}

async function mapByMd5(md5: string): Promise<LibraryMap | null> {
  const r = await select(`SELECT m.*, r.attempts AS attempts, r.best AS best FROM maps m ${PLAYS} WHERE m.md5 = $md5`, {
    $md5: md5
  });
  return r[0] ? toMap(r[0]) : null;
}

export async function libraryMapPath(md5: string): Promise<string | null> {
  const r = await select('SELECT path FROM maps WHERE md5 = $md5', { $md5: md5 });
  const path = r[0]?.path as string | undefined;
  return path && existsSync(path) ? path : null;
}

// ---------- Twój poziom ----------

const quantile = (values: number[], q: number): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (pos - lo);
};

const rateOf = (mods: string) => (/\b(DT|NC)\b/.test(mods) ? 1.5 : /\bHT\b/.test(mods) ? 0.75 : 1);

export interface ProfilePlay {
  accuracy: number;
  mods: string;
  streamBpm: number | null;
  streamUr: number | null;
  stars: number | null;
  ar: number | null;
  blockMs: number | null;
  jumpDistance: number | null;
  jumpsPerMin: number | null;
}

/** Poziom gracza z listy gier (czysta funkcja – testowana osobno). */
export function profileFrom(plays: ProfilePlay[]): PlayerProfile {
  const accMedian = quantile(plays.map((p) => p.accuracy), 0.5) ?? 0;
  const good = plays.filter((p) => p.accuracy >= accMedian);
  const goodNm = good.filter((p) => rateOf(p.mods) === 1);

  // streamy: tempo, które grasz równo (UR w streamach nie gorszy niż Twoja mediana + 10%)
  const withStreams = plays.filter((p) => (p.streamBpm ?? 0) > 0 && (p.streamUr ?? 0) > 0);
  const urMedian = quantile(withStreams.map((p) => p.streamUr!), 0.5) ?? 0;
  const even = withStreams.filter((p) => p.streamUr! <= urMedian * 1.1).map((p) => p.streamBpm! * rateOf(p.mods));
  const blocks = good.filter((p) => (p.blockMs ?? 0) > 0).map((p) => p.blockMs! / 1000 / rateOf(p.mods));
  const jumps = goodNm.filter((p) => (p.jumpsPerMin ?? 0) >= 5 && p.jumpDistance !== null).map((p) => p.jumpDistance!);
  const round = (v: number | null, d = 0) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    plays: plays.length,
    streamBpm: even.length >= 3 ? round(quantile(even, 0.75)) : null,
    blockS: blocks.length >= 3 ? round(quantile(blocks, 0.75), 1) : null,
    stars: goodNm.filter((p) => p.stars !== null).length >= 3 ? round(quantile(goodNm.filter((p) => p.stars !== null).map((p) => p.stars!), 0.5), 2) : null,
    ar: goodNm.length >= 3 ? round(quantile(goodNm.filter((p) => p.ar !== null).map((p) => p.ar!), 0.5), 1) : null,
    jumpDistance: jumps.length >= 3 ? round(quantile(jumps, 0.75), 2) : null
  };
}

export async function playerProfile(days = 60): Promise<PlayerProfile> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await select(
    `SELECT r.accuracy, r.mods, r.stream_bpm, r.stream_ur, m.stars, m.ar, m.longest_block_ms, m.jump_distance, m.jumps_per_min
     FROM replays r LEFT JOIN maps m ON m.md5 = r.beatmap_md5
     WHERE r.played_at >= $since AND r.partial = 0`,
    { $since: since }
  );
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return profileFrom(
    rows.map((r) => ({
      accuracy: Number(r.accuracy ?? 0),
      mods: String(r.mods ?? ''),
      streamBpm: n(r.stream_bpm),
      streamUr: n(r.stream_ur),
      stars: n(r.stars),
      ar: n(r.ar),
      blockMs: n(r.longest_block_ms),
      jumpDistance: n(r.jump_distance),
      jumpsPerMin: n(r.jumps_per_min)
    }))
  );
}

// ---------- drabinka do mapy-celu ----------

interface Feature {
  get: (m: LibraryMap) => number | null;
  start: (p: PlayerProfile, target: number) => number;
  /** o ile różnica „kosztuje” – większa skala = mniej ważna cecha */
  scale: number;
}

const FEATURES: Record<LadderResult['basis'], Feature[]> = {
  streams: [
    { get: (m) => m.streamBpm, start: (p, t) => p.streamBpm ?? t - 30, scale: 8 },
    { get: (m) => m.longestBlockMs / 1000, start: (p, t) => p.blockS ?? t * 0.4, scale: 5 },
    { get: (m) => m.stars, start: (p, t) => p.stars ?? t - 1, scale: 0.8 }
  ],
  jumps: [
    { get: (m) => m.jumpDistance, start: (p, t) => p.jumpDistance ?? t * 0.7, scale: 0.35 },
    { get: (m) => m.jumpsPerMin, start: (_p, t) => t * 0.5, scale: 12 },
    { get: (m) => m.ar, start: (p, t) => p.ar ?? t - 1, scale: 0.6 },
    { get: (m) => m.stars, start: (p, t) => p.stars ?? t - 1, scale: 0.8 }
  ],
  general: [
    { get: (m) => m.stars, start: (p, t) => p.stars ?? t - 1, scale: 0.35 },
    { get: (m) => m.ar, start: (p, t) => p.ar ?? t - 1, scale: 0.6 },
    { get: (m) => m.bpm, start: (_p, t) => t * 0.9, scale: 20 }
  ]
};

export function ladderBasis(target: LibraryMap): LadderResult['basis'] {
  if (target.jumpsPerMin >= 25) return 'jumps'; // mapa przede wszystkim skokowa, nawet z krótkimi streamami
  if ((target.streamBpm ?? 0) > 0 && target.streamPct >= 15) return 'streams';
  if (target.jumpsPerMin >= 10) return 'jumps';
  return 'general';
}

/** Wybiera mapy-schodki między Twoim poziomem a celem (czysta funkcja – testowana osobno). */
export function buildLadder(target: LibraryMap, pool: LibraryMap[], profile: PlayerProfile, steps = 4): LadderResult {
  const basis = ladderBasis(target);
  const feats = FEATURES[basis].filter((f) => f.get(target) !== null);
  const goal = feats.map((f) => f.get(target)!);
  // start: Twój poziom; jeśli już jesteś powyżej celu w danej cesze – 85% celu, żeby drabinka szła w górę
  const start = feats.map((f, k) => {
    const s = f.start(profile, goal[k]!);
    return s < goal[k]! ? s : goal[k]! * 0.85;
  });
  const used = new Set<string>([target.md5]);
  // ta sama piosenka i wersja w innym kliencie to ta sama mapa – nie powtarzamy
  const key = (m: LibraryMap) => `${m.artist}|${m.title}|${m.version}`.toLowerCase();
  const usedKeys = new Set<string>([key(target)]);
  const out: LadderStep[] = [];
  const n = Math.min(Math.max(steps, 2), 6);
  for (let k = 1; k < n; k++) {
    const share = k / n;
    const want = feats.map((_f, j) => start[j]! + share * (goal[j]! - start[j]!));
    let best: LibraryMap | null = null;
    let bestD = Infinity;
    for (const m of pool) {
      if (used.has(m.md5) || usedKeys.has(key(m))) continue;
      if (basis === 'streams' && ((m.streamBpm ?? 0) === 0 || m.streamPct < 8)) continue;
      let d = 0;
      for (let j = 0; j < feats.length; j++) {
        const v = feats[j]!.get(m);
        d += v === null ? 4 : ((v - want[j]!) / feats[j]!.scale) ** 2;
      }
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best) {
      used.add(best.md5);
      usedKeys.add(key(best));
      out.push({ map: best, step: k, share });
    }
  }
  // schodki od najłatwiejszego: średni postęp od Twojego poziomu do celu we wszystkich cechach
  const progress = (m: LibraryMap) => {
    let sum = 0;
    feats.forEach((f, j) => {
      const span = goal[j]! - start[j]!;
      const v = f.get(m);
      sum += v === null || span === 0 ? 0.5 : Math.min(Math.max((v - start[j]!) / span, 0), 1.2);
    });
    return sum / Math.max(feats.length, 1);
  };
  out.sort((a, b) => progress(a.map) - progress(b.map));
  out.forEach((s, i) => (s.step = i + 1));
  out.push({ map: target, step: out.length + 1, share: 1 });
  return { target, basis, steps: out };
}

export async function mapLadder(md5: string, steps = 4): Promise<LadderResult> {
  const target = await mapByMd5(md5);
  if (!target) return { target: null, basis: 'general', steps: [] };
  const profile = await playerProfile();
  const basis = ladderBasis(target);
  // wstępne zawężenie w SQL, dokładny wybór w JS
  const where =
    basis === 'streams'
      ? `m.stream_bpm BETWEEN ${Math.round((profile.streamBpm ?? target.streamBpm! - 40) - 25)} AND ${Math.round(target.streamBpm! + 5)}`
      : basis === 'jumps'
        ? `m.jump_distance <= ${target.jumpDistance + 0.3}`
        : `(m.stars IS NULL OR m.stars <= ${(target.stars ?? 10) + 0.3})`;
  const pool = (
    await select(`SELECT m.*, r.attempts AS attempts, r.best AS best FROM maps m ${PLAYS} WHERE m.error IS NULL AND ${where} LIMIT 5000`)
  ).map(toMap);
  return buildLadder(target, pool, profile, steps);
}
