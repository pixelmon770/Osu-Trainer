// Cele liczone z historii: obecna wartość, postęp 0–1 i data osiągnięcia (zapisywana raz).

import type { Goal, GoalProgress } from '../shared/api.ts';
import { listDrills, queryReplays } from './history.ts';
import { getSettings, updateSettings } from './settings.ts';

const DAY = 86_400_000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Jak liczyć postęp: niższe = lepiej, bliżej zera = lepiej, wyższe = lepiej. */
const DIRECTION: Record<Goal['metric'], 'down' | 'zero' | 'up'> = {
  ur: 'down',
  streamUr: 'down',
  k2k1: 'zero',
  entry: 'zero',
  accuracy: 'up',
  plays: 'up',
  drills: 'up',
  mapAccuracy: 'up'
};

export async function evaluateGoal(g: Goal): Promise<GoalProgress> {
  const sinceDays = Math.max(1, g.days);
  const plays = (await queryReplays({ sinceDays, limit: 5000, beatmapMd5: g.metric === 'mapAccuracy' ? g.beatmapMd5 ?? null : null })).items;
  const streams = plays.filter((p) => (p.streamBpm ?? 0) > 0 && p.streamUr > 0);
  let current: number | null = null;
  let samples = plays.length;
  switch (g.metric) {
    case 'ur':
      current = mean(plays.map((p) => p.ur));
      break;
    case 'accuracy':
      current = mean(plays.map((p) => p.accuracy));
      break;
    case 'k2k1':
      current = mean(plays.map((p) => p.k2Mean - p.k1Mean));
      break;
    case 'streamUr':
      current = mean(streams.map((p) => p.streamUr));
      samples = streams.length;
      break;
    case 'entry':
      current = mean(streams.map((p) => p.entryMean));
      samples = streams.length;
      break;
    case 'plays':
      current = plays.length;
      break;
    case 'drills': {
      const drills = await listDrills(null, null, 5000, new Date(Date.now() - sinceDays * DAY).toISOString());
      current = drills.length;
      samples = drills.length;
      break;
    }
    case 'mapAccuracy':
      current = plays.length ? Math.max(...plays.map((p) => p.accuracy)) : null;
      break;
  }

  const dir = DIRECTION[g.metric];
  let reached = false;
  let progress = 0;
  // średnie z 1–2 gier to szum – dla miar „jakości” wymagamy co najmniej 3 prób
  const enough = dir === 'up' && (g.metric === 'plays' || g.metric === 'drills') ? true : samples >= 3 || g.metric === 'mapAccuracy';
  if (current !== null && enough) {
    if (dir === 'down') {
      reached = current <= g.target;
      progress = reached ? 1 : Math.max(0, Math.min(1, g.target / current));
    } else if (dir === 'zero') {
      reached = Math.abs(current) <= g.target;
      progress = reached ? 1 : Math.max(0, Math.min(1, g.target / Math.abs(current)));
    } else {
      reached = current >= g.target;
      progress = Math.max(0, Math.min(1, g.target > 0 ? current / g.target : 1));
    }
  }
  return { goal: g, current, progress, reached, samples };
}

/** Postęp wszystkich celów; cel osiągnięty pierwszy raz dostaje datę (zapisaną w ustawieniach). */
export async function goalsProgress(): Promise<GoalProgress[]> {
  const goals = getSettings().goals ?? [];
  const out = await Promise.all(goals.map(evaluateGoal));
  let changed = false;
  const now = new Date().toISOString();
  const updated = goals.map((g, i) => {
    if (out[i]!.reached && !g.doneAt) {
      changed = true;
      return { ...g, doneAt: now };
    }
    return g;
  });
  if (changed) {
    await updateSettings({ goals: updated });
    out.forEach((p, i) => (p.goal = updated[i]!));
  }
  return out;
}
