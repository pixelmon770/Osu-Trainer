// Historia analiz w lokalnej bazie SQLite (plik osu-trainer.sqlite w folderze danych programu).
// sql.js to SQLite skompilowany do WebAssembly – nie wymaga kompilowania niczego na Windows.

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { ReplayAnalysis } from '@osu-trainer/analyzer';
import { app } from 'electron';
import initSqlJs, { type Database } from 'sql.js';
import type { MapGroup, MapInfo, ReplayFilter, ReplayResult, ReplaySource, ReplaySummary } from '../shared/api.ts';

const SCHEMA_VERSION = 3;
const dbFile = () => join(app.getPath('userData'), 'osu-trainer.sqlite');

let dbPromise: Promise<Database> | null = null;
let saveTimer: NodeJS.Timeout | null = null;

function open(): Promise<Database> {
  dbPromise ??= (async () => {
    const SQL = await initSqlJs();
    let db: Database;
    try {
      db = new SQL.Database(new Uint8Array(await readFile(dbFile())));
    } catch {
      db = new SQL.Database();
    }
    migrate(db);
    return db;
  })();
  return dbPromise;
}

function migrate(db: Database): void {
  const version = (db.exec('PRAGMA user_version')[0]?.values[0]?.[0] as number) ?? 0;
  if (version < 1) {
    db.run(`
      CREATE TABLE IF NOT EXISTS replays (
        id TEXT PRIMARY KEY,
        file TEXT NOT NULL,
        map_file TEXT NOT NULL,
        beatmap_md5 TEXT NOT NULL,
        artist TEXT, title TEXT, version TEXT, creator TEXT, map_end_ms INTEGER,
        played_at TEXT NOT NULL,
        analyzed_at TEXT NOT NULL,
        mods TEXT NOT NULL,
        score INTEGER, max_combo INTEGER, accuracy REAL,
        count300 INTEGER, count100 INTEGER, count50 INTEGER, count_miss INTEGER,
        ur REAL, mean_error REAL, k1_mean REAL, k2_mean REAL, k1_ur REAL, k2_ur REAL,
        stream_ur REAL, outside_ur REAL, entry_mean REAL, alternation REAL, tap_spread REAL,
        partial INTEGER NOT NULL,
        analysis BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS replays_played_at ON replays(played_at DESC);
      CREATE INDEX IF NOT EXISTS replays_beatmap ON replays(beatmap_md5);
      CREATE INDEX IF NOT EXISTS replays_file ON replays(file);
    `);
  }
  if (version < 2) {
    db.run(`ALTER TABLE replays ADD COLUMN source TEXT NOT NULL DEFAULT 'stable'`);
  }
  if (version < 3) {
    // ta sama gra zapisana pod różnymi plikami (np. lazer zapisał replay ponownie) – zostawiamy pierwszy wpis
    db.run(`DELETE FROM replays WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM replays GROUP BY beatmap_md5, played_at, score
    )`);
    db.run('CREATE INDEX IF NOT EXISTS replays_play ON replays(beatmap_md5, played_at, score)');
  }
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Zapis na dysk z opóźnieniem – kilka analiz pod rząd = jeden zapis. */
function scheduleSave(db: Database): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(db), 800);
}

async function flush(db: Database): Promise<void> {
  saveTimer = null;
  const data = db.export();
  const tmp = dbFile() + '.tmp';
  try {
    await writeFile(tmp, data);
    await rename(tmp, dbFile()); // podmiana całego pliku naraz – brak uszkodzeń przy zamknięciu w trakcie
  } catch {
    // Windows potrafi zablokować podmianę (antywirus, indeksowanie) – wtedy zapis wprost
    await writeFile(dbFile(), data).catch((e) => console.error('Nie udało się zapisać historii:', e));
  }
}

/** Czy jest zapis czekający na dysk. */
export function hasPendingSave(): boolean {
  return saveTimer !== null;
}

export async function flushNow(): Promise<void> {
  if (!dbPromise || !saveTimer) return;
  clearTimeout(saveTimer);
  await flush(await dbPromise);
}

export async function saveReplay(r: {
  id: string;
  replayFile: string;
  mapFile: string;
  beatmapMd5: string;
  map: MapInfo;
  analysis: ReplayAnalysis;
  source: ReplaySource;
}): Promise<ReplaySummary> {
  const db = await open();
  const a = r.analysis;
  db.run(
    `INSERT OR REPLACE INTO replays (
      id, file, map_file, beatmap_md5, artist, title, version, creator, map_end_ms,
      played_at, analyzed_at, mods, score, max_combo, accuracy,
      count300, count100, count50, count_miss, ur, mean_error, k1_mean, k2_mean, k1_ur, k2_ur,
      stream_ur, outside_ur, entry_mean, alternation, tap_spread, partial, analysis, source
    ) VALUES (
      $id, $file, $map_file, $beatmap_md5, $artist, $title, $version, $creator, $map_end_ms,
      $played_at, $analyzed_at, $mods, $score, $max_combo, $accuracy,
      $c300, $c100, $c50, $miss, $ur, $mean, $k1, $k2, $k1ur, $k2ur,
      $stream_ur, $outside_ur, $entry, $alt, $spread, $partial, $analysis, $source)`,
    {
      $id: r.id,
      $file: r.replayFile,
      $map_file: r.mapFile,
      $beatmap_md5: r.beatmapMd5,
      $artist: r.map.artist,
      $title: r.map.title,
      $version: r.map.version,
      $creator: r.map.creator,
      $map_end_ms: r.map.endMs,
      $played_at: a.playedAt,
      $analyzed_at: new Date().toISOString(),
      $mods: a.mods.join(','),
      $score: a.score,
      $max_combo: a.maxCombo,
      $accuracy: a.header.accuracy,
      $c300: a.header.count300,
      $c100: a.header.count100,
      $c50: a.header.count50,
      $miss: a.header.countMiss,
      $ur: a.errors.ur,
      $mean: a.errors.mean,
      $k1: a.keys.K1.mean,
      $k2: a.keys.K2.mean,
      $k1ur: a.keys.K1.ur,
      $k2ur: a.keys.K2.ur,
      $stream_ur: a.streams.errors.ur,
      $outside_ur: a.streams.outside.ur,
      $entry: a.streams.entry.mean,
      $alt: a.streams.alternation,
      $spread: a.streams.tapSpread,
      $partial: a.partial ? 1 : 0,
      $analysis: gzipSync(JSON.stringify(a)),
      $source: r.source
    }
  );
  scheduleSave(db);
  return (await getSummary(r.id))!;
}

const SUMMARY_COLUMNS = `id, file, beatmap_md5, artist, title, version, played_at, analyzed_at, mods, accuracy, count_miss,
  max_combo, ur, k1_mean, k2_mean, stream_ur, entry_mean, alternation, tap_spread, partial, source`;

function toSummary(row: Record<string, unknown>): ReplaySummary {
  return {
    id: row.id as string,
    file: row.file as string,
    beatmapMd5: (row.beatmap_md5 as string) ?? '',
    artist: (row.artist as string) ?? '',
    title: (row.title as string) ?? '',
    version: (row.version as string) ?? '',
    playedAt: row.played_at as string,
    analyzedAt: row.analyzed_at as string,
    mods: ((row.mods as string) || '').split(',').filter(Boolean),
    accuracy: row.accuracy as number,
    countMiss: row.count_miss as number,
    maxCombo: row.max_combo as number,
    ur: row.ur as number,
    k1Mean: row.k1_mean as number,
    k2Mean: row.k2_mean as number,
    streamUr: row.stream_ur as number,
    entryMean: (row.entry_mean as number) ?? 0,
    alternation: (row.alternation as number) ?? 0,
    tapSpread: (row.tap_spread as number) ?? 0,
    partial: row.partial === 1,
    source: ((row.source as string) || 'stable') as ReplaySource
  };
}

function rows(db: Database, sql: string, params: Record<string, string | number> = {}): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: Record<string, unknown>[] = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

/** Warunki WHERE z filtra – zawsze przez parametry, nigdy przez sklejanie tekstu. */
function where(f: ReplayFilter, withMap = true): { sql: string; params: Record<string, string | number> } {
  const parts: string[] = [];
  const params: Record<string, string | number> = {};
  const q = f.search?.trim().toLowerCase();
  if (q) {
    // każde słowo musi wystąpić gdziekolwiek (tytuł, artysta, poziom, mapper)
    q.split(/\s+/).slice(0, 6).forEach((word, i) => {
      parts.push(`instr(lower(coalesce(title,'') || ' ' || coalesce(artist,'') || ' ' || coalesce(version,'') || ' ' || coalesce(creator,'')), $w${i}) > 0`);
      params[`$w${i}`] = word;
    });
  }
  if (withMap && f.beatmapMd5) {
    parts.push('beatmap_md5 = $md5');
    params.$md5 = f.beatmapMd5;
  }
  if (f.source && f.source !== 'all') {
    parts.push('source = $source');
    params.$source = f.source;
  }
  if (f.sinceDays) {
    parts.push('played_at >= $since');
    params.$since = new Date(Date.now() - f.sinceDays * 86_400_000).toISOString();
  }
  if (f.mods) {
    parts.push('mods = $mods');
    params.$mods = f.mods === 'NM' ? '' : f.mods;
  }
  if (f.hidePartial) parts.push('partial = 0');
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

const ORDER: Record<NonNullable<ReplayFilter['sort']>, string> = {
  newest: 'played_at DESC',
  oldest: 'played_at ASC',
  accuracy: 'accuracy DESC, played_at DESC',
  ur: 'ur ASC, played_at DESC'
};

export async function queryReplays(f: ReplayFilter): Promise<{ items: ReplaySummary[]; total: number }> {
  const db = await open();
  const w = where(f);
  const total = (rows(db, `SELECT COUNT(*) AS n FROM replays ${w.sql}`, w.params)[0]?.n as number) ?? 0;
  const order = ORDER[f.sort ?? 'newest'] ?? ORDER.newest;
  const items = rows(db, `SELECT ${SUMMARY_COLUMNS} FROM replays ${w.sql} ORDER BY ${order} LIMIT $limit`, {
    ...w.params,
    $limit: Math.max(1, Math.min(f.limit ?? 500, 5000))
  }).map(toSummary);
  return { items, total };
}

export async function listMaps(f: ReplayFilter): Promise<MapGroup[]> {
  const db = await open();
  const w = where(f, false);
  return rows(
    db,
    `SELECT beatmap_md5, artist, title, version, COUNT(*) AS attempts, MAX(played_at) AS last_played,
            MAX(accuracy) AS best_acc, MIN(ur) AS best_ur
     FROM replays ${w.sql}
     GROUP BY beatmap_md5
     ORDER BY attempts DESC, last_played DESC
     LIMIT 1000`,
    w.params
  ).map((r) => ({
    beatmapMd5: r.beatmap_md5 as string,
    artist: (r.artist as string) ?? '',
    title: (r.title as string) ?? '',
    version: (r.version as string) ?? '',
    attempts: r.attempts as number,
    lastPlayed: r.last_played as string,
    bestAccuracy: r.best_acc as number,
    bestUr: r.best_ur as number
  }));
}

export async function modCombos(): Promise<string[]> {
  const db = await open();
  return rows(db, 'SELECT mods, COUNT(*) AS n FROM replays GROUP BY mods ORDER BY n DESC').map((r) => (r.mods as string) || 'NM');
}

async function getSummary(id: string): Promise<ReplaySummary | null> {
  const db = await open();
  const row = rows(db, `SELECT ${SUMMARY_COLUMNS} FROM replays WHERE id = $id`, { $id: id })[0];
  return row ? toSummary(row) : null;
}

export async function getReplay(id: string): Promise<ReplayResult> {
  const db = await open();
  const row = rows(db, 'SELECT * FROM replays WHERE id = $id', { $id: id })[0];
  if (!row) return { ok: false, error: 'not-found' };
  return {
    ok: true,
    id,
    replayFile: row.file as string,
    mapFile: row.map_file as string,
    beatmapMd5: row.beatmap_md5 as string,
    map: {
      artist: row.artist as string,
      title: row.title as string,
      version: row.version as string,
      creator: row.creator as string,
      endMs: row.map_end_ms as number
    },
    analysis: JSON.parse(gunzipSync(row.analysis as Uint8Array).toString('utf8')) as ReplayAnalysis
  };
}

/** Ta sama gra niezależnie od pliku: mapa + chwila zagrania + wynik. */
export async function findPlay(beatmapMd5: string, playedAt: string, score: number): Promise<string | null> {
  const db = await open();
  const row = rows(db, 'SELECT id FROM replays WHERE beatmap_md5 = $md5 AND played_at = $at AND score = $score LIMIT 1', {
    $md5: beatmapMd5,
    $at: playedAt,
    $score: score
  })[0];
  return row ? (row.id as string) : null;
}

export async function hasReplay(id: string): Promise<boolean> {
  return (await getSummary(id)) !== null;
}

export async function knownFiles(): Promise<Set<string>> {
  const db = await open();
  return new Set(rows(db, 'SELECT file FROM replays').map((r) => (r.file as string).toLowerCase()));
}

export async function deleteReplay(id: string): Promise<void> {
  const db = await open();
  db.run('DELETE FROM replays WHERE id = $id', { $id: id });
  scheduleSave(db);
}

export async function countReplays(): Promise<number> {
  const db = await open();
  return (db.exec('SELECT COUNT(*) FROM replays')[0]?.values[0]?.[0] as number) ?? 0;
}
