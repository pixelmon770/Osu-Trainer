import { describe, expect, it } from 'vitest';
import { aimFromBeatmap, circleRadius, generateAim, judgeAim, parseBeatmap } from '../src/index.ts';

const r = circleRadius(4);

describe('generator skoków', () => {
  it('tam i z powrotem: odległość = n średnic, rytm 1/2', () => {
    const n = generateAim({ pattern: 'backforth', distance: 3, bpm: 150, divisor: 2, notes: 6, cs: 4 });
    expect(n[1]!.time).toBe(200);
    expect(Math.hypot(n[1]!.x - n[0]!.x, n[1]!.y - n[0]!.y)).toBeCloseTo(6 * r, 3);
  });

  it('wielokąt: bok = odległość skoku', () => {
    const n = generateAim({ pattern: 'polygon', sides: 4, distance: 2, bpm: 150, divisor: 2, notes: 4, cs: 4 });
    expect(Math.hypot(n[1]!.x - n[0]!.x, n[1]!.y - n[0]!.y)).toBeCloseTo(4 * r, 3);
  });

  it('losowe: wszystko na planszy, te same skoki przy tym samym ziarnie', () => {
    const a = generateAim({ pattern: 'random', distance: 4, bpm: 180, divisor: 2, notes: 200, cs: 4, angles: 'sharp', seed: 7 });
    const b = generateAim({ pattern: 'random', distance: 4, bpm: 180, divisor: 2, notes: 200, cs: 4, angles: 'sharp', seed: 7 });
    expect(a).toEqual(b);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(r - 1e-9);
      expect(p.x).toBeLessThanOrEqual(512 - r + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(r - 1e-9);
      expect(p.y).toBeLessThanOrEqual(384 - r + 1e-9);
    }
  });
});

describe('ocena aimu', () => {
  const notes = [
    { time: 0, x: 100, y: 200, combo: 1 },
    { time: 400, x: 300, y: 200, combo: 2 },
    { time: 800, x: 100, y: 200, combo: 3 },
    { time: 1200, x: 300, y: 200, combo: 4 }
  ];
  const res = judgeAim(
    notes,
    [
      { time: 0, x: 100, y: 200 }, // środek
      { time: 410, x: 300 + r * 0.5, y: 200 }, // przestrzał o pół promienia
      { time: 800, x: 100 + r * 1.5, y: 200 } // obok kółka = miss aim
      // 1200: brak kliknięcia = miss timing
    ],
    8,
    4
  );
  it('trafienia, przestrzał i rodzaje missów', () => {
    expect(res.notes.map((n) => n.judgement)).toEqual([300, 300, 0, 0]);
    expect(res.notes[1]!.along).toBeCloseTo(0.5, 6);
    expect(res.notes.map((n) => n.miss)).toEqual([null, null, 'aim', 'timing']);
    // nuta 3: kliknięcie za krótko (w stronę, z której przyszedł skok) = niedolot
    expect(res.notes[2]!.along).toBeCloseTo(-1.5, 6);
    expect(res.hitRate).toBe(50);
  });
});

// ---------- patterny z nazwami ze społeczności ----------

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
/** kąt między kolejnymi skokami w punkcie b (180° = prosto, 0° = zawrócenie) */
const angleAt = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
  const v1 = [a.x - b.x, a.y - b.y];
  const v2 = [c.x - b.x, c.y - b.y];
  const cos = (v1[0]! * v2[0]! + v1[1]! * v2[1]!) / (Math.hypot(v1[0]!, v1[1]!) * Math.hypot(v2[0]!, v2[1]!));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};
const onBoard = (notes: { x: number; y: number }[]) =>
  notes.every((p) => p.x >= r - 1e-6 && p.x <= 512 - r + 1e-6 && p.y >= r - 1e-6 && p.y <= 384 - r + 1e-6);

describe('patterny maperów', () => {
  const base = { distance: 2.5, bpm: 180, divisor: 2, notes: 60, cs: 4, seed: 3 };

  it('trójkąty: skok = odległość, kąty 60° wewnątrz trójkąta', () => {
    const n = generateAim({ ...base, pattern: 'triangles' });
    expect(onBoard(n)).toBe(true);
    expect(dist(n[0]!, n[1]!)).toBeCloseTo(5 * r, 3);
    expect(dist(n[1]!, n[2]!)).toBeCloseTo(5 * r, 3);
    expect(angleAt(n[0]!, n[1]!, n[2]!)).toBeCloseTo(60, 3);
  });

  it('gwiazda: ostre kąty 36°, wszystkie skoki w obiegu równe', () => {
    const n = generateAim({ ...base, pattern: 'star' });
    expect(onBoard(n)).toBe(true);
    for (let i = 0; i < 4; i++) expect(dist(n[i]!, n[i + 1]!)).toBeCloseTo(5 * r, 3);
    expect(angleAt(n[0]!, n[1]!, n[2]!)).toBeCloseTo(36, 3);
  });

  it('kwadraty: kąty 90°', () => {
    const n = generateAim({ ...base, pattern: 'square' });
    expect(onBoard(n)).toBe(true);
    expect(angleAt(n[0]!, n[1]!, n[2]!)).toBeCloseTo(90, 3);
    expect(dist(n[0]!, n[1]!)).toBeCloseTo(5 * r, 3);
  });

  it('oibon: na zmianę lewa i prawa krawędź planszy', () => {
    const n = generateAim({ ...base, pattern: 'oibon' });
    expect(onBoard(n)).toBe(true);
    for (let i = 0; i < n.length; i++) expect(n[i]!.x < 256 === (i % 2 === 0)).toBe(true);
    expect(Math.abs(n[1]!.x - n[0]!.x)).toBeGreaterThan(512 - 3 * r);
  });

  const flowAngles = (distance: number) => {
    const n = generateAim({ ...base, distance, pattern: 'flow', notes: 200 });
    expect(onBoard(n)).toBe(true);
    const angles: number[] = [];
    for (let i = 1; i < n.length - 1; i++) angles.push(angleAt(n[i - 1]!, n[i]!, n[i + 1]!));
    return angles;
  };

  it('flow: do 2 średnic prawie same szerokie kąty (płynny ruch)', () => {
    const angles = flowAngles(2);
    expect(angles.filter((a) => a >= 110).length / angles.length).toBeGreaterThan(0.9);
  });

  it('flow: przy dużej odległości krąży po planszy zamiast zawracać', () => {
    // 3 średnice to 219 px na planszy 440×312 – łuk musi być ciaśniejszy, ale bez skoków tam i z powrotem
    const angles = flowAngles(3).slice(1);
    expect(Math.min(...angles)).toBeGreaterThan(60);
  });
});

describe('skoki z prawdziwej mapy', () => {
  // mapa: 4 skoki na 1/2 (180 BPM), potem przerwa, potem stream (mały spacing) – stream nie jest skokiem
  const lines = [
    'osu file format v14',
    '[General]',
    'Mode: 0',
    '[Difficulty]',
    'CircleSize:4',
    'OverallDifficulty:8',
    'ApproachRate:9',
    'SliderMultiplier:1.4',
    'SliderTickRate:1',
    '[TimingPoints]',
    '0,333.333333333333,4,2,0,60,1,0',
    '[HitObjects]'
  ];
  const jumps = [
    [100, 100],
    [400, 100],
    [250, 300],
    [100, 100],
    [400, 100]
  ];
  jumps.forEach(([x, y], i) => lines.push(`${x},${y},${1000 + i * 167},1,0,0:0:0:0:`));
  for (let i = 0; i < 12; i++) lines.push(`${200 + i * 8},200,${4000 + i * 83},1,0,0:0:0:0:`);
  const map = parseBeatmap(lines.join('\n'));

  it('wycina tylko fragment ze skokami, z rytmem mapy i tempem rate', () => {
    const { notes, sections, cs } = aimFromBeatmap(map, { rate: 1 });
    expect(cs).toBe(4);
    expect(sections).toHaveLength(1);
    expect(notes).toHaveLength(5);
    expect(notes[1]!.time - notes[0]!.time).toBe(167);
    expect(notes[2]!.x).toBe(250);
    const slow = aimFromBeatmap(map, { rate: 0.5 });
    expect(slow.notes[1]!.time - slow.notes[0]!.time).toBe(334);
  });
});
