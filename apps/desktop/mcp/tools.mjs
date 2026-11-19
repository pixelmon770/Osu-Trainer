// Narzędzia osu! Trenera dla AI: zestawienia z bazy historii w Markdownie.
// Używane przez serwer MCP (server.mjs) i przez „Eksport dla AI” w programie – te same dane w obu miejscach.
// Tylko CZYTA bazę (osu-trainer.sqlite).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

let DB_PATH =
  process.env.OSU_TRAINER_DB ||
  join(process.env.APPDATA || join(process.env.HOME || '', '.config'), 'osu-trainer', 'osu-trainer.sqlite');

let SQL = null;

/** Program podaje własną ścieżkę bazy (folder danych Electrona). */
export function setDbPath(path) {
  DB_PATH = path;
}

async function db() {
  SQL ??= await initSqlJs();
  if (!existsSync(DB_PATH)) throw new Error(`Brak bazy osu! Trenera: ${DB_PATH}. Uruchom program i przeanalizuj kilka replayów.`);
  return new SQL.Database(readFileSync(DB_PATH)); // świeża kopia przy każdym pytaniu – zawsze aktualne dane
}

function rows(d, sql, params = {}) {
  const st = d.prepare(sql);
  st.bind(params);
  const out = [];
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
}

const n = (v, digits = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits));
const s = (v, digits = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(digits)}`);
const since = (days) => new Date(Date.now() - days * 86400000).toISOString();

// ---------- narzędzia ----------

export const TOOLS = [
  {
    name: 'get_profile_summary',
    description:
      'Summary of the osu! player\'s measured skills from analyzed replays: accuracy, unstable rate (UR), K1/K2 key timing gap, stream entry, stream UR, results by stream BPM, most played maps and comparison with the previous period. Use this first to understand the player.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 3650, default: 30, description: 'Period in days' } } }
  },
  {
    name: 'list_replays',
    description: 'List analyzed replays (newest first) with accuracy, UR, K2−K1, misses and stream BPM. Optional text search over title/artist/difficulty/mapper.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        days: { type: 'integer', minimum: 1, maximum: 3650 },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
        hide_partial: { type: 'boolean', description: 'Hide quits/fails', default: false }
      }
    }
  },
  {
    name: 'get_replay',
    description:
      'Detailed analysis of one replay by id (from list_replays): per-key timing, error by position inside streams, burst entry, alternation, aim, miss types (no click / aim / notelock / too early) and accuracy over time.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'list_drills',
    description: 'Results of finger exercises done in the app (rhythm patterns and tap trainer): BPM, UR, K1/K2 means, wrong fingers, entry.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 3650, default: 30 }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 30 } } }
  },
  {
    name: 'get_map_progress',
    description: 'All attempts on one map (difficulty) in time order – shows progress. Find maps with list_replays and pass the beatmap_md5.',
    inputSchema: { type: 'object', properties: { beatmap_md5: { type: 'string' } }, required: ['beatmap_md5'] }
  }
];

function avg(d, where, params) {
  return rows(
    d,
    `SELECT COUNT(*) n, AVG(accuracy) acc, AVG(ur) ur, AVG(k2_mean - k1_mean) gap,
            AVG(CASE WHEN stream_bpm > 0 AND stream_ur > 0 THEN stream_ur END) sur,
            AVG(CASE WHEN stream_bpm > 0 AND stream_ur > 0 THEN entry_mean END) entry,
            AVG(count_miss) miss
     FROM replays ${where}`,
    params
  )[0];
}

async function profileSummary({ days = 30 }) {
  const d = await db();
  const cur = avg(d, 'WHERE played_at >= $a', { $a: since(days) });
  const prev = avg(d, 'WHERE played_at >= $a AND played_at < $b', { $a: since(days * 2), $b: since(days) });
  const total = rows(d, 'SELECT COUNT(*) n, MIN(played_at) first FROM replays')[0];
  const bpm = rows(
    d,
    `SELECT CASE WHEN stream_bpm < 160 THEN '<160' WHEN stream_bpm < 180 THEN '160-179' WHEN stream_bpm < 200 THEN '180-199'
                 WHEN stream_bpm < 220 THEN '200-219' WHEN stream_bpm < 240 THEN '220-239' ELSE '240+' END r,
            MIN(stream_bpm) o, COUNT(*) n, AVG(stream_ur) sur, AVG(k2_mean - k1_mean) gap, AVG(entry_mean) entry, AVG(accuracy) acc
     FROM replays WHERE stream_bpm > 0 AND stream_ur > 0 AND played_at >= $a GROUP BY r ORDER BY o`,
    { $a: since(days) }
  );
  const maps = rows(
    d,
    `SELECT beatmap_md5, title, version, COUNT(*) n, MAX(accuracy) best, AVG(ur) ur FROM replays
     WHERE played_at >= $a GROUP BY beatmap_md5 ORDER BY n DESC LIMIT 8`,
    { $a: since(days) }
  );
  const drills = rows(d, 'SELECT COUNT(*) n, AVG(ur) ur, AVG(k2_mean - k1_mean) gap FROM drills WHERE created_at >= $a', { $a: since(days) })[0];
  d.close();
  const line = (label, a, b, digits, signed) =>
    `| ${label} | ${signed ? s(a, digits) : n(a, digits)} | ${prev.n ? (signed ? s(b, digits) : n(b, digits)) : '—'} |`;
  return [
    `# osu! Trener – player summary (last ${days} days)`,
    `Replays in history: ${total.n} (since ${total.first ? total.first.slice(0, 10) : '—'}). In this period: ${cur.n}, previous period: ${prev.n}.`,
    '',
    `| Metric | Last ${days} d | Previous ${days} d |`,
    '|---|---|---|',
    line('Accuracy %', cur.acc, prev.acc, 2),
    line('UR (10×SD of hit error)', cur.ur, prev.ur, 0),
    line('K2 − K1 mean (ms, + = K2 later)', cur.gap, prev.gap, 1, true),
    line('Stream UR', cur.sur, prev.sur, 0),
    line('Stream entry (ms, first note of each stream)', cur.entry, prev.entry, 1, true),
    line('Misses per play', cur.miss, prev.miss, 1),
    '',
    '## By stream BPM of the map',
    '| BPM | plays | stream UR | K2−K1 ms | entry ms | accuracy % |',
    '|---|---|---|---|---|---|',
    ...bpm.map((b) => `| ${b.r} | ${b.n} | ${n(b.sur)} | ${s(b.gap)} | ${s(b.entry)} | ${n(b.acc, 2)} |`),
    '',
    '## Most played maps',
    ...maps.map((m) => `- ${m.title} [${m.version}] – ${m.n} attempts, best ${n(m.best, 2)}%, avg UR ${n(m.ur)} (beatmap_md5: ${m.beatmap_md5})`),
    '',
    `Exercises in the app: ${drills.n} (avg UR ${n(drills.ur)}, K2−K1 ${s(drills.gap)} ms).`,
    '',
    'Notes: UR = unstable rate (lower is better). Notelock = clicking the next note while the previous one is still waiting.'
  ].join('\n');
}

async function listReplays({ search, days, limit = 20, hide_partial = false }) {
  const d = await db();
  const where = [];
  const params = { $limit: Math.min(200, limit) };
  if (days) {
    where.push('played_at >= $a');
    params.$a = since(days);
  }
  if (hide_partial) where.push('partial = 0');
  (search || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .forEach((w, i) => {
      where.push(`instr(lower(coalesce(title,'')||' '||coalesce(artist,'')||' '||coalesce(version,'')||' '||coalesce(creator,'')), $w${i}) > 0`);
      params[`$w${i}`] = w;
    });
  const list = rows(
    d,
    `SELECT id, beatmap_md5, artist, title, version, played_at, mods, accuracy, count_miss, ur, k1_mean, k2_mean, stream_bpm, stream_ur, partial, source
     FROM replays ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY played_at DESC LIMIT $limit`,
    params
  );
  d.close();
  if (!list.length) return 'No replays match.';
  return [
    '| id | played | map | mods | acc % | UR | K2−K1 ms | misses | stream BPM | quit/fail |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...list.map(
      (r) =>
        `| ${r.id} | ${r.played_at.slice(0, 16).replace('T', ' ')} | ${r.artist} – ${r.title} [${r.version}] | ${r.mods || 'NM'} | ${n(r.accuracy, 2)} | ${n(r.ur)} | ${s(r.k2_mean - r.k1_mean)} | ${r.count_miss} | ${r.stream_bpm > 0 ? n(r.stream_bpm) : '—'} | ${r.partial ? 'yes' : ''} |`
    )
  ].join('\n');
}

async function getReplay({ id }) {
  const d = await db();
  const r = rows(d, 'SELECT * FROM replays WHERE id = $id', { $id: id })[0];
  d.close();
  if (!r) return `Replay ${id} not found.`;
  const a = JSON.parse(gunzipSync(Buffer.from(r.analysis)).toString('utf8'));
  const e = (x) => `${s(x.mean)} ms (UR ${n(x.ur)}, ${x.count} notes)`;
  return [
    `# ${r.artist} – ${r.title} [${r.version}]`,
    `Played ${r.played_at.slice(0, 16).replace('T', ' ')} UTC · ${a.mods.length ? a.mods.join('') : 'NM'} · ${r.source}${a.partial ? ' · ended early (quit/fail)' : ''}`,
    `osu! result: ${n(a.header.accuracy, 2)}% · 300/100/50/miss ${a.header.count300}/${a.header.count100}/${a.header.count50}/${a.header.countMiss} · max combo ${a.maxCombo}`,
    `CS ${n(a.difficulty.cs, 1)} AR ${n(a.difficulty.ar, 1)} OD ${n(a.difficulty.od, 1)} · hit windows 300 ±${n(a.difficulty.windows.great)} ms, 100 ±${n(a.difficulty.windows.ok)} ms`,
    '',
    '## Timing',
    `- All notes: ${e(a.errors)}`,
    `- K1: ${e(a.keys.K1)}`,
    `- K2: ${e(a.keys.K2)}`,
    `- K2 − K1: ${s(a.keys.K2.mean - a.keys.K1.mean)} ms`,
    '',
    '## Streams',
    `- In streams: ${e(a.streams.errors)}; outside streams: ${e(a.streams.outside)}`,
    `- Burst entry (first note): ${e(a.streams.entry)}`,
    `- Alternation: ${n(a.streams.alternation, 1)}% (${a.streams.alternationBreaks} breaks); tap spread ${n(a.streams.tapSpread, 1)} ms`,
    '- Mean error by position in stream:',
    ...a.streams.byPosition.filter((b) => b.notes).map((b) => `  - notes ${b.range}: ${s(b.errors.mean)} ms, UR ${n(b.errors.ur)}, misses ${b.misses}/${b.notes}`),
    '',
    '## Aim and misses',
    `- Click distance from center: ${n(a.aim.meanDistance * 100)}% of radius; jump over/undershoot ${s(a.aim.jumpOvershoot * 100, 0)}% of radius (${a.aim.jumpCount} jumps)`,
    `- Misses: no click ${a.misses.noClick}, aim ${a.misses.aim}, notelock ${a.misses.notelock}, too early ${a.misses.early}`,
    '',
    `## Accuracy over time (${Math.round((a.segmentMs || 20000) / 1000)} s sections)`,
    ...a.timeline.map((t) => `- ${Math.floor(t.startMs / 60000)}:${String(Math.floor((t.startMs / 1000) % 60)).padStart(2, '0')} – ${n(t.accuracy, 1)}%, UR ${n(t.errors.ur)}, misses ${t.misses}`),
    a.fatigueAt !== null ? `Accuracy starts dropping two sections in a row from ${Math.floor(a.fatigueAt / 60000)}:${String(Math.floor((a.fatigueAt / 1000) % 60)).padStart(2, '0')}.` : ''
  ].join('\n');
}

async function listDrills({ days = 30, limit = 30 }) {
  const d = await db();
  const list = rows(d, 'SELECT * FROM drills WHERE created_at >= $a ORDER BY created_at DESC LIMIT $l', { $a: since(days), $l: Math.min(200, limit) });
  d.close();
  if (!list.length) return 'No exercises in this period.';
  return [
    '| when | exercise | BPM | notes | acc % | UR | K1 ms | K2 ms | wrong finger | entry ms |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...list.map(
      (r) =>
        `| ${r.created_at.slice(0, 16).replace('T', ' ')} | ${r.kind}: ${r.label || r.name} | ${n(r.bpm)} | ${r.notes} | ${n(r.accuracy, 1)} | ${n(r.ur)} | ${s(r.k1_mean)} | ${s(r.k2_mean)} | ${r.wrong_finger} | ${s(r.entry_mean)} |`
    )
  ].join('\n');
}

async function mapProgress({ beatmap_md5 }) {
  const d = await db();
  const list = rows(d, 'SELECT * FROM replays WHERE beatmap_md5 = $m ORDER BY played_at', { $m: beatmap_md5 });
  d.close();
  if (!list.length) return 'No attempts on this map.';
  return [
    `# ${list[0].title} [${list[0].version}] – ${list.length} attempts`,
    '| # | played | mods | acc % | UR | K2−K1 ms | stream UR | entry ms | misses | quit/fail |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...list.map(
      (r, i) =>
        `| ${i + 1} | ${r.played_at.slice(0, 16).replace('T', ' ')} | ${r.mods || 'NM'} | ${n(r.accuracy, 2)} | ${n(r.ur)} | ${s(r.k2_mean - r.k1_mean)} | ${n(r.stream_ur)} | ${s(r.entry_mean)} | ${r.count_miss} | ${r.partial ? 'yes' : ''} |`
    )
  ].join('\n');
}

export const HANDLERS = { get_profile_summary: profileSummary, list_replays: listReplays, get_replay: getReplay, list_drills: listDrills, get_map_progress: mapProgress };

