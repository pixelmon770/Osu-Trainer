// Analiza mapy z linii poleceń:
//   npm run analyze -- "C:\ścieżka\do\mapy.osu"
//   npm run analyze -- "C:\folder\z\mapami"        (wszystkie pliki .osu w folderze)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { analyzeMapText, formatTime } from './analyzeMap.ts';

// npm uruchamia skrypt w folderze pakietu, więc ścieżkę liczymy od folderu, z którego wpisano komendę
const arg = process.argv[2];
if (!arg) {
  console.error('Podaj ścieżkę do pliku .osu albo folderu z plikami .osu');
  process.exit(1);
}
const target = resolve(process.env.INIT_CWD ?? process.cwd(), arg);

const files = statSync(target).isDirectory()
  ? readdirSync(target).filter((f) => f.endsWith('.osu')).map((f) => join(target, f))
  : [target];

for (const file of files) {
  try {
    const a = analyzeMapText(readFileSync(file, 'utf8'));
    const b = a.streams.longestBlocks[0];
    console.log(`\n${a.artist} - ${a.title} [${a.version}]`);
    console.log(`  długość ${formatTime(a.lengthMs)} · CS ${a.cs} · AR ${a.ar} · OD ${a.od} · obiektów ${a.objects}`);
    console.log(
      `  streamy: ${a.streams.count} (${a.streams.notes} nut, ${a.streams.percentOfObjects.toFixed(0)}% obiektów), ` +
        `${(a.streams.totalMs / 1000).toFixed(0)} s, ${a.streams.bpm.toFixed(0)} BPM, mediana ${a.streams.medianLength} nut, spacing ${a.streams.spacing.toFixed(2)}`
    );
    if (a.streams.longest) {
      console.log(
        `  najdłuższy stream: ${a.streams.longest.notes} nut (${(a.streams.longest.durationMs / 1000).toFixed(1)} s) od ${formatTime(a.streams.longest.startMs)}, spacing ${a.streams.longest.spacing.toFixed(2)}`
      );
    }
    if (b) console.log(`  najdłuższy blok: ${(b.durationMs / 1000).toFixed(1)} s od ${formatTime(b.startMs)} (${b.notes} nut)`);
    console.log(
      `  skoki na 1/2 > 1,5 średnicy: ${a.jumps.jumpsOver1_5Diameters} · średnio ${a.jumps.averageHalfBeatDistance.toFixed(2)} średnicy`
    );
    console.log(
      `  czytanie: nakładanie ${a.reading.overlapPercent.toFixed(0)}% · widać ${a.reading.beatsVisibleAhead.toFixed(2)} uderzenia do przodu`
    );
  } catch (e) {
    console.error(`\n${file}: ${(e as Error).message}`);
  }
}
