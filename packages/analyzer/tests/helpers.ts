// Budowanie małych, sztucznych map .osu do testów.

export interface TestObject {
  t: number;
  x: number;
  y: number;
}

export function makeOsu(opts: { bpm: number; cs?: number; ar?: number; od?: number; objects: TestObject[] }): string {
  const beat = 60000 / opts.bpm;
  return [
    'osu file format v14',
    '',
    '[General]',
    'Mode: 0',
    '',
    '[Metadata]',
    'Title:Test',
    'Artist:Analyzer',
    'Creator:osu! Trener',
    'Version:Synthetic',
    '',
    '[Difficulty]',
    'HPDrainRate:5',
    `CircleSize:${opts.cs ?? 4}`,
    `OverallDifficulty:${opts.od ?? 8}`,
    `ApproachRate:${opts.ar ?? 9}`,
    'SliderMultiplier:1.4',
    'SliderTickRate:1',
    '',
    '[TimingPoints]',
    `0,${beat},4,2,0,60,1,0`,
    '',
    '[HitObjects]',
    ...opts.objects.map((o) => `${o.x},${o.y},${o.t},1,0,0:0:0:0:`)
  ].join('\n');
}

export function line(startT: number, count: number, stepT: number, x: number, y: number, stepX: number): TestObject[] {
  return Array.from({ length: count }, (_, i) => ({ t: startT + i * stepT, x: x + i * stepX, y }));
}
