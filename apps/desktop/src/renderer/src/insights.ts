// Wnioski z analizy replaya – zamieniamy liczby na kilka konkretnych zdań.
// Progi są celowo ostrożne: lepiej nic nie powiedzieć niż wskazać szum jako problem.

import type { ReplayAnalysis } from '@osu-trainer/analyzer';
import type { TFunction } from 'i18next';
import { formatTime, type Formatters } from './format.ts';

export interface Insight {
  tone: 'warn' | 'info' | 'good';
  text: string;
}

export function buildInsights(a: ReplayAnalysis, mapEndMs: number, t: TFunction, f: Formatters): Insight[] {
  const out: Insight[] = [];
  const ms = (v: number) => f.num(Math.abs(v), 1);

  if (a.partial) {
    out.push({ tone: 'info', text: t('replay.insight.partial', { at: formatTime(a.lastFrameMs), end: formatTime(mapEndMs) }) });
  }

  // K1 kontra K2
  const k1 = a.keys.K1;
  const k2 = a.keys.K2;
  if (k1.count >= 30 && k2.count >= 30 && Math.abs(k2.mean - k1.mean) >= 4) {
    const later = k2.mean > k1.mean ? 'K2' : 'K1';
    const earlier = later === 'K2' ? 'K1' : 'K2';
    out.push({ tone: 'warn', text: t('replay.insight.keyGap', { later, earlier, diff: ms(k2.mean - k1.mean) }) });
  }

  // dryf w długich streamach
  const rows = a.streams.byPosition.filter((r) => r.errors.count >= 15);
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first && last && first !== last && last.errors.mean - first.errors.mean >= 8) {
    out.push({
      tone: 'warn',
      text: t('replay.insight.streamDrift', {
        first: f.signed(first.errors.mean),
        last: f.signed(last.errors.mean),
        range: last.range
      })
    });
  }

  // streamy kontra reszta mapy
  if (a.streams.errors.count >= 50 && a.streams.outside.count >= 50 && a.streams.errors.ur > a.streams.outside.ur * 1.25) {
    out.push({
      tone: 'warn',
      text: t('replay.insight.streamUr', { stream: f.num(a.streams.errors.ur), outside: f.num(a.streams.outside.ur) })
    });
  }

  // wejście w bursty
  if (a.streams.entry.count >= 15 && Math.abs(a.streams.entry.mean) >= 8) {
    out.push({
      tone: 'info',
      text: t(a.streams.entry.mean > 0 ? 'replay.insight.entryLate' : 'replay.insight.entryEarly', { value: ms(a.streams.entry.mean) })
    });
  }

  // rodzaje missów
  const totalMisses = a.misses.noClick + a.misses.aim + a.misses.early + a.misses.notelock;
  if (totalMisses >= 5) {
    const top = (Object.entries(a.misses) as [keyof typeof a.misses, number][]).sort((x, y) => y[1] - x[1])[0]!;
    if (top[1] / totalMisses >= 0.45) {
      out.push({ tone: 'warn', text: t(`replay.insight.miss_${top[0]}`, { count: top[1], total: totalMisses }) });
    }
  }

  if (a.fatigueAt !== null) out.push({ tone: 'info', text: t('replay.insight.fatigue', { at: formatTime(a.fatigueAt) }) });

  if (a.streams.alternation > 0 && a.streams.alternation < 97 && a.streams.alternationBreaks >= 5) {
    out.push({ tone: 'info', text: t('replay.insight.alternation', { breaks: a.streams.alternationBreaks, percent: f.num(a.streams.alternation) }) });
  }

  if (a.errors.count >= 100 && Math.abs(a.errors.mean) >= 6) {
    out.push({ tone: 'info', text: t(a.errors.mean > 0 ? 'replay.insight.offsetLate' : 'replay.insight.offsetEarly', { value: ms(a.errors.mean) }) });
  }

  if (a.aim.jumpCount >= 30 && Math.abs(a.aim.jumpOvershoot) >= 0.15) {
    out.push({
      tone: 'info',
      text: t(a.aim.jumpOvershoot > 0 ? 'replay.insight.overshoot' : 'replay.insight.undershoot', {
        value: f.num(Math.abs(a.aim.jumpOvershoot) * 100)
      })
    });
  }

  if (!out.some((i) => i.tone === 'warn')) out.push({ tone: 'good', text: t('replay.insight.noIssues') });
  return out;
}
