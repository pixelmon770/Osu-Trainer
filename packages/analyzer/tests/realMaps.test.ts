// Porównanie z prawdziwymi mapami (wyniki z docs/data/maps_analyzed.json).
// Mapy nie są w repo. Wrzuć pliki .osu do folderu fixtures-local/ w głównym katalogu repo
// albo ustaw zmienną OSU_MAPS_DIR na folder z mapami (np. folder Songs). Bez map test się pomija.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeMapText } from '../src/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = process.env.OSU_MAPS_DIR ?? join(root, 'fixtures-local');
const expectedFile = join(root, 'docs/data/maps_analyzed.json');

interface Expected {
  map: string;
  stream_bpm: number;
  stream_seconds: number;
  spacing_avg: number;
  longest_block: { seconds: number; notes: number };
}

function findOsu(folder: string, depth = 0): string[] {
  if (depth > 3) return [];
  return readdirSync(folder).flatMap((name) => {
    const p = join(folder, name);
    if (statSync(p).isDirectory()) return findOsu(p, depth + 1);
    return name.endsWith('.osu') ? [p] : [];
  });
}

const haveMaps = existsSync(dir) && existsSync(expectedFile);
const expected: Expected[] = haveMaps ? JSON.parse(readFileSync(expectedFile, 'utf8')).local : [];
const files = haveMaps ? findOsu(dir) : [];

describe.skipIf(!haveMaps || files.length === 0)('prawdziwe mapy', () => {
  const byName = new Map<string, string>();
  for (const f of files) {
    const a = analyzeMapText(readFileSync(f, 'utf8'));
    byName.set(`${a.artist} - ${a.title} [${a.version}]`, f);
  }
  const present = expected.filter((e) => byName.has(e.map));

  it('w folderze jest co najmniej jedna mapa z danych referencyjnych', () => {
    expect(present.length).toBeGreaterThan(0);
  });

  for (const e of present) {
    it(e.map, () => {
      const a = analyzeMapText(readFileSync(byName.get(e.map)!, 'utf8'));
      const block = a.streams.longestBlocks[0]!;
      expect(Math.round(a.streams.bpm)).toBe(e.stream_bpm);
      expect(Math.round(a.streams.totalMs / 1000)).toBe(e.stream_seconds);
      expect(a.streams.spacing).toBeCloseTo(e.spacing_avg, 2);
      expect(block.durationMs / 1000).toBeCloseTo(e.longest_block.seconds, 1);
      expect(block.notes).toBe(e.longest_block.notes);
    });
  }
});
