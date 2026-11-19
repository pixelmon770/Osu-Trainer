// Sesje gry i Pulpit: gry i ćwiczenia grupowane w sesje (przerwa > 45 min = nowa sesja),
// rozgrzewka i zmęczenie w sesji, podsumowanie dnia/tygodnia i podpowiedź, co dziś trenować.

import type { DashboardData, DrillRecord, Recommendation, ReplaySummary, SessionSummary } from '../shared/api.ts';
import { listDrills, queryReplays } from './history.ts';

const GAP_MS = 45 * 60_000;
const DAY = 86_400_000;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const time = (iso: string) => new Date(iso).getTime();

interface Item {
  at: number;
  replay?: ReplaySummary;
  drill?: DrillRecord;
}

export function groupSessions(replays: ReplaySummary[], drills: DrillRecord[]): SessionSummary[] {
  const items: Item[] = [
    ...replays.map((r) => ({ at: time(r.playedAt), replay: r })),
    ...drills.map((d) => ({ at: time(d.createdAt), drill: d }))
  ].sort((a, b) => a.at - b.at);

  const groups: Item[][] = [];
  for (const it of items) {
    const cur = groups[groups.length - 1];
    if (cur && it.at - cur[cur.length - 1]!.at <= GAP_MS) cur.push(it);
    else groups.push([it]);
  }

  return groups
    .map((g) => {
      const plays = g.flatMap((x) => (x.replay ? [x.replay] : []));
      const drillList = g.flatMap((x) => (x.drill ? [x.drill] : []));
      // rozgrzewka: pierwsze 3 gry wobec reszty; zmęczenie: ostatnia trzecia część wobec środka
      const ur = plays.map((p) => p.ur);
      const warmupUr = plays.length >= 6 ? mean(ur.slice(0, 3)) : null;
      const restUr = plays.length >= 6 ? mean(ur.slice(3)) : null;
      const third = Math.floor(plays.length / 3);
      const middleUr = plays.length >= 9 ? mean(ur.slice(third, 2 * third)) : null;
      const endUr = plays.length >= 9 ? mean(ur.slice(2 * third)) : null;
      const best = plays.reduce<ReplaySummary | null>((b, p) => (!b || p.accuracy > b.accuracy ? p : b), null);
      const mapCount = new Set(plays.map((p) => p.beatmapMd5)).size;
      return {
        id: String(g[0]!.at),
        start: new Date(g[0]!.at).toISOString(),
        end: new Date(g[g.length - 1]!.at).toISOString(),
        durationMs: g[g.length - 1]!.at - g[0]!.at,
        plays: plays.length,
        drills: drillList.length,
        maps: mapCount,
        accuracy: mean(plays.map((p) => p.accuracy)),
        ur: mean(ur),
        k2k1: mean(plays.map((p) => p.k2Mean - p.k1Mean)),
        streamUr: mean(plays.filter((p) => (p.streamBpm ?? 0) > 0 && p.streamUr > 0).map((p) => p.streamUr)),
        warmup: warmupUr !== null && restUr !== null ? { firstUr: warmupUr, restUr } : null,
        fatigue: middleUr !== null && endUr !== null ? { middleUr, endUr } : null,
        drillUr: mean(drillList.map((d) => d.ur)),
        best: best ? { id: best.id, title: best.title, version: best.version, accuracy: best.accuracy } : null,
        playIds: plays.map((p) => p.id)
      } satisfies SessionSummary;
    })
    .reverse();
}

export async function listSessions(sinceDays: number | null): Promise<SessionSummary[]> {
  const since = sinceDays ? new Date(Date.now() - sinceDays * DAY).toISOString() : undefined;
  const replays = (await queryReplays({ sinceDays, sort: 'oldest', limit: 5000 })).items;
  const drills = await listDrills(null, null, 5000, since);
  return groupSessions(replays, drills);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1]!;
}

const round5 = (v: number) => Math.round(v / 5) * 5;

/** Podpowiedzi „co dziś trenować” z ostatnich 14 dni – proste reguły, od najważniejszej. */
export function recommend(recent: ReplaySummary[], sessions: SessionSummary[], drills: DrillRecord[]): Recommendation[] {
  const out: Recommendation[] = [];
  const withStreams = recent.filter((p) => (p.streamBpm ?? 0) > 0 && p.streamUr > 0);
  const bpm = median(withStreams.map((p) => p.streamBpm!)) ?? 170;
  const gap = mean(recent.map((p) => p.k2Mean - p.k1Mean));
  const entry = mean(withStreams.map((p) => p.entryMean));
  const streamUr = mean(withStreams.map((p) => p.streamUr));
  const ur = mean(recent.map((p) => p.ur));
  const fatigueSessions = sessions.filter((s) => s.fatigue && s.fatigue.endUr > s.fatigue.middleUr * 1.1).length;
  const longSessions = sessions.filter((s) => s.plays >= 9).length;

  if (recent.length === 0) {
    out.push({ id: 'calibrate', reason: 'noData', screen: 'rhythm', exercise: 'single', bpm: 150 });
    return out;
  }
  if (gap !== null && Math.abs(gap) >= 5) {
    out.push({ id: 'onlyP', reason: 'keyGap', value: gap, screen: 'rhythm', exercise: gap > 0 ? 'onlyP' : 'single', bpm: round5(bpm - 15) });
    out.push({ id: 'single', reason: 'keyGapEven', value: gap, screen: 'rhythm', exercise: 'single', bpm: round5(bpm - 10) });
  }
  if (entry !== null && Math.abs(entry) >= 8) {
    out.push({ id: 'burstEntry', reason: 'entry', value: entry, screen: 'rhythm', exercise: 'burst5L', bpm: round5(bpm - 5) });
  }
  if (streamUr !== null && ur !== null && streamUr > ur * 1.15) {
    out.push({ id: 'ladder', reason: 'streamUr', value: streamUr, screen: 'trainer', mode: 'ladder', bpm: round5(bpm - 15), length: 7 });
  }
  if (longSessions >= 2 && fatigueSessions / longSessions >= 0.5) {
    out.push({ id: 'stamina', reason: 'fatigue', screen: 'trainer', mode: 'stream', bpm: round5(bpm - 10), seconds: 30 });
  }
  const drilledToday = drills.some((d) => Date.now() - time(d.createdAt) < DAY);
  if (!drilledToday && out.length === 0) {
    out.push({ id: 'maintain', reason: 'maintain', screen: 'rhythm', exercise: 'stream16', bpm: round5(bpm - 5) });
  }
  return out.slice(0, 4);
}

export async function dashboard(): Promise<DashboardData> {
  const now = Date.now();
  const all = (await queryReplays({ sinceDays: 28, sort: 'oldest', limit: 5000 })).items;
  const drills = await listDrills(null, null, 5000, new Date(now - 28 * DAY).toISOString());
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = all.filter((p) => time(p.playedAt) >= startOfDay.getTime());
  const week = all.filter((p) => time(p.playedAt) >= now - 7 * DAY);
  const prevWeek = all.filter((p) => time(p.playedAt) < now - 7 * DAY && time(p.playedAt) >= now - 14 * DAY);
  const recent = all.filter((p) => time(p.playedAt) >= now - 14 * DAY);
  const sessions = groupSessions(all, drills);

  const tot = (list: ReplaySummary[]) => ({
    plays: list.length,
    accuracy: mean(list.map((p) => p.accuracy)),
    ur: mean(list.map((p) => p.ur)),
    k2k1: mean(list.map((p) => p.k2Mean - p.k1Mean))
  });

  // seria dni z grą albo ćwiczeniem
  const days = new Set([...all.map((p) => new Date(p.playedAt).toDateString()), ...drills.map((d) => new Date(d.createdAt).toDateString())]);
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // dziś jeszcze nie grane – liczymy od wczoraj
  while (days.has(d.toDateString()) && streak < 400) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return {
    today: { ...tot(today), drills: drills.filter((d) => time(d.createdAt) >= startOfDay.getTime()).length },
    week: tot(week),
    previousWeek: prevWeek.length ? tot(prevWeek) : null,
    latest: [...all].reverse().slice(0, 6),
    lastSession: sessions[0] ?? null,
    recommendations: recommend(recent, sessions.slice(0, 10), drills),
    recentDrills: drills.slice(0, 5),
    streak
  };
}
