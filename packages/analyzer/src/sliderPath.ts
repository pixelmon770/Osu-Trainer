// Ścieżka slidera jak w osu!: Bézier (z punktami „czerwonymi” dzielącymi odcinki), łuk przez 3 punkty (P),
// linie (L). Ścieżka jest przycinana albo przedłużana do długości z pliku mapy (pixelLength).

export interface Point {
  x: number;
  y: number;
}

export type CurveType = 'B' | 'P' | 'L' | 'C';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function bezierSegment(ctrl: Point[]): Point[] {
  if (ctrl.length < 2) return [...ctrl];
  if (ctrl.length === 2) return [...ctrl];
  let approx = 0;
  for (let i = 1; i < ctrl.length; i++) approx += dist(ctrl[i - 1]!, ctrl[i]!);
  const steps = Math.max(8, Math.min(400, Math.ceil(approx / 3)));
  const out: Point[] = [];
  const tmp = ctrl.map((p) => ({ ...p }));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    for (let i = 0; i < ctrl.length; i++) tmp[i] = { ...ctrl[i]! };
    for (let k = ctrl.length - 1; k > 0; k--) {
      for (let i = 0; i < k; i++) {
        tmp[i] = { x: tmp[i]!.x + (tmp[i + 1]!.x - tmp[i]!.x) * t, y: tmp[i]!.y + (tmp[i + 1]!.y - tmp[i]!.y) * t };
      }
    }
    out.push(tmp[0]!);
  }
  return out;
}

function bezier(points: Point[]): Point[] {
  // powtórzony punkt = koniec jednego odcinka i początek następnego
  const out: Point[] = [];
  let seg: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    if (p.x === prev.x && p.y === prev.y) {
      out.push(...bezierSegment(seg));
      seg = [p];
    } else seg.push(p);
  }
  out.push(...bezierSegment(seg));
  return out;
}

function perfectCircle(a: Point, b: Point, c: Point): Point[] | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null; // punkty w jednej linii
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  };
  const r = dist(a, center);
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  let end = Math.atan2(c.y - center.y, c.x - center.x);
  // kierunek: zgodnie z kolejnością A → B → C
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (cross < 0) {
    while (end > start) end -= 2 * Math.PI;
  } else {
    while (end < start) end += 2 * Math.PI;
  }
  const steps = Math.max(8, Math.min(400, Math.ceil((Math.abs(end - start) * r) / 3)));
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const ang = start + ((end - start) * i) / steps;
    out.push({ x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r });
  }
  return out;
}

/** Punkty wzdłuż ścieżki slidera, przycięte do `pixelLength`. */
export function sliderPath(type: CurveType, points: Point[], pixelLength: number): Point[] {
  if (points.length < 2) return [...points];
  let raw: Point[];
  if (type === 'P' && points.length === 3) raw = perfectCircle(points[0]!, points[1]!, points[2]!) ?? points;
  else if (type === 'B' || type === 'C') raw = bezier(points);
  else raw = points;
  if (!(pixelLength > 0)) return raw;

  // przycięcie do długości z mapy (albo przedłużenie ostatniego odcinka)
  const out: Point[] = [raw[0]!];
  let len = 0;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!;
    const b = raw[i]!;
    const d = dist(a, b);
    if (d === 0) continue;
    if (len + d >= pixelLength) {
      const t = (pixelLength - len) / d;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      return out;
    }
    len += d;
    out.push(b);
  }
  // ścieżka krótsza niż długość slidera – osu! przedłuża ją w linii prostej
  const last = out[out.length - 1]!;
  const prev = out[out.length - 2];
  if (prev && len < pixelLength) {
    const d = dist(prev, last) || 1;
    const extra = pixelLength - len;
    out.push({ x: last.x + ((last.x - prev.x) / d) * extra, y: last.y + ((last.y - prev.y) / d) * extra });
  }
  return out;
}
