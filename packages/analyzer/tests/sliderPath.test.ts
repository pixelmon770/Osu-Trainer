import { describe, expect, it } from 'vitest';
import { parseBeatmap, sliderPath } from '../src/index.ts';

const len = (pts: { x: number; y: number }[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);

describe('ścieżki sliderów', () => {
  it('linia przycięta do długości z mapy', () => {
    const p = sliderPath('L', [{ x: 0, y: 0 }, { x: 200, y: 0 }], 150);
    expect(p.at(-1)).toEqual({ x: 150, y: 0 });
  });

  it('linia przedłużona, gdy punkty są krótsze niż długość', () => {
    const p = sliderPath('L', [{ x: 0, y: 0 }, { x: 100, y: 0 }], 130);
    expect(p.at(-1)!.x).toBeCloseTo(130, 6);
  });

  it('łuk przez 3 punkty: półokrąg ma długość πr i kończy się w trzecim punkcie', () => {
    const p = sliderPath('P', [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }], Math.PI * 100);
    expect(len(p)).toBeCloseTo(Math.PI * 100, 0);
    expect(p.at(-1)!.x).toBeCloseTo(200, 0);
    expect(p.at(-1)!.y).toBeCloseTo(0, 0);
    // środek łuku po stronie punktu B
    expect(p[Math.floor(p.length / 2)]!.y).toBeGreaterThan(90);
  });

  it('Bézier z czerwonym punktem dzieli się na dwa odcinki', () => {
    const p = sliderPath('B', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 200);
    expect(p.at(-1)!.x).toBeCloseTo(100, 3);
    expect(p.at(-1)!.y).toBeCloseTo(100, 3);
  });

  it('parser zapisuje koniec slidera z prawdziwej ścieżki', () => {
    const text = `osu file format v14\n[General]\nMode: 0\n[Difficulty]\nCircleSize:4\nOverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.4\n[TimingPoints]\n0,400,4,2,0,60,1,0\n[HitObjects]\n0,0,1000,2,0,L|300:0,1,150\n`;
    const o = parseBeatmap(text).hitObjects[0]!;
    expect(o.endX).toBeCloseTo(150, 6);
    expect(o.curvePoints).toHaveLength(2);
  });
});
