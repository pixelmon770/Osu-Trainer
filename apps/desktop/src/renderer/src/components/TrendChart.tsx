// Wykres jednej miary próba po próbie (celność, UR, K2−K1…) z linią trendu.
// Jedna seria, jedna oś – kilka miar = kilka małych wykresów obok siebie.

export interface TrendPoint {
  id: string;
  /** krótki podpis pod osią (data) */
  label: string;
  /** dłuższy opis w podpowiedzi (domyślnie = label) */
  tip?: string;
  value: number;
}

interface Props {
  title: string;
  points: TrendPoint[];
  format: (v: number) => string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** pozioma linia zera (np. dla K2−K1) */
  zeroLine?: boolean;
  /** podpis: czy lepiej, gdy wartość rośnie, czy maleje */
  betterHint?: string;
}

/** Linia trendu metodą najmniejszych kwadratów. */
function regression(values: number[]): { a: number; b: number } | null {
  const n = values.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2;
  const my = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += (i - mx) * (v - my);
    den += (i - mx) ** 2;
  });
  const b = den ? num / den : 0;
  return { a: my - b * mx, b };
}

export default function TrendChart({ title, points, format, selectedId, onSelect, zeroLine, betterHint }: Props) {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values, ...(zeroLine ? [0] : []));
  let hi = Math.max(...values, ...(zeroLine ? [0] : []));
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
  lo -= pad;
  hi += pad;
  const x = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const trend = regression(values);
  const last = points.length - 1;
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  const labelIdx = Array.from(new Set([0, Math.floor(last / 2), last]));

  return (
    <div className="card trend">
      <div className="trend-head">
        <h4>{title}</h4>
        {betterHint && <span className="muted small">{betterHint}</span>}
      </div>
      <div className="line-chart small">
        <div className="y-axis">
          {ticks.map((v, i) => (
            <span key={i}>{format(v)}</span>
          ))}
        </div>
        <div className="plot">
          {ticks.map((v, i) => (
            <div key={i} className="grid-line" style={{ top: `${y(v)}%` }} />
          ))}
          {zeroLine && <div className="grid-line zero-line" style={{ top: `${y(0)}%` }} />}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={line} fill="none" stroke="#8c7ae6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {trend && (
              <line
                x1={0}
                y1={y(trend.a)}
                x2={100}
                y2={y(trend.a + trend.b * last)}
                stroke="#d4d6db"
                strokeOpacity="0.45"
                strokeWidth="1.5"
                strokeDasharray="5 5"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {points.map((p, i) => (
            <button
              type="button"
              key={p.id}
              className={`dot as-button${p.id === selectedId ? ' marked' : ''}`}
              style={{ left: `${x(i)}%`, top: `${y(p.value)}%` }}
              title={`${p.tip ?? p.label} · ${format(p.value)}`}
              aria-label={`${p.tip ?? p.label}: ${format(p.value)}`}
              onClick={() => onSelect?.(p.id)}
            />
          ))}
        </div>
      </div>
      <div className="x-axis">
        {labelIdx.map((i) => (
          <span
            key={i}
            className={i === 0 && last > 0 ? 'edge-start' : i === last && last > 0 ? 'edge-end' : ''}
            style={{ left: `calc(44px + (100% - 44px) * ${x(i) / 100})` }}
          >
            {points[i]!.label}
          </span>
        ))}
      </div>
    </div>
  );
}
