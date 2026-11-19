import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReplaySummary } from '../../../shared/api.ts';
import roadmap from '../data/roadmap.json';
import { makeFormatters } from '../format.ts';
import { useSettings } from './RhythmScreen.tsx';

type Status = 'mocne' | 'ok' | 'slabe' | 'brak';
type Node = (typeof roadmap.nodes)[number];

const COL_W = 200;
const ROW_H = 66;
const NODE_W = 168;
const NODE_H = 46;
const STATUS_ORDER: Status[] = ['brak', 'slabe', 'ok', 'mocne'];
const FIELDS = ['what', 'why', 'measure', 'train', 'maps'] as const;

/** Oceny z danych dla węzłów, które da się zmierzyć z replayów (ostatnie 30 dni). */
function assess(list: ReplaySummary[]): Record<string, { status: Status; value: string }> {
  const out: Record<string, { status: Status; value: string }> = {};
  if (list.length < 5) return out;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const grade = (v: number, good: number, ok: number): Status => (v <= good ? 'mocne' : v <= ok ? 'ok' : 'slabe');
  const gap = Math.abs(mean(list.map((s) => s.k2Mean - s.k1Mean)));
  out.palce = { status: grade(gap, 3, 7), value: `K2−K1 ${gap.toFixed(1)} ms` };
  const ur = mean(list.map((s) => s.ur));
  out.acc = { status: grade(ur, 140, 190), value: `UR ${ur.toFixed(0)}` };
  const streams = list.filter((s) => (s.streamBpm ?? 0) > 0 && s.streamUr > 0);
  if (streams.length >= 5) {
    const alt = mean(streams.map((s) => s.alternation));
    out.alt = { status: alt >= 99 ? 'mocne' : alt >= 97 ? 'ok' : 'slabe', value: `${alt.toFixed(1)}%` };
    const entry = Math.abs(mean(streams.map((s) => s.entryMean)));
    out.burst = { status: grade(entry, 5, 10), value: `${entry.toFixed(1)} ms` };
    const ratio = mean(streams.map((s) => s.streamUr)) / mean(streams.map((s) => s.ur));
    out.stream = { status: grade(ratio, 1.1, 1.25), value: `×${ratio.toFixed(2)}` };
  }
  return out;
}

export default function RoadmapScreen() {
  const { t, i18n } = useTranslation();
  const f = makeFormatters(i18n.language);
  const { settings, update } = useSettings();
  const [selected, setSelected] = useState<Node | null>(roadmap.nodes[0] ?? null);
  const [auto, setAuto] = useState<Record<string, { status: Status; value: string }>>({});
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    void window.api.queryReplays({ sinceDays: 30, limit: 1000 }).then((r) => setAuto(assess(r.items)));
  }, []);

  const cols = roadmap.columns.length;
  const rows = Math.max(...roadmap.nodes.map((n) => n.row)) + 1;
  const width = cols * COL_W;
  const height = rows * ROW_H;

  // dopasowanie grafu do szerokości okna
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1.25, Math.max(0.55, el.clientWidth / width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const byId = useMemo(() => new Map(roadmap.nodes.map((n) => [n.id, n])), []);
  const pos = (n: Node) => ({ x: n.column * COL_W + (COL_W - NODE_W) / 2, y: n.row * ROW_H + (ROW_H - NODE_H) / 2 });
  const statusOf = (id: string): { status: Status; fromData: boolean } => {
    const own = settings?.roadmap?.[id] as Status | undefined;
    if (own) return { status: own, fromData: false };
    if (auto[id]) return { status: auto[id]!.status, fromData: true };
    return { status: 'brak', fromData: false };
  };
  const setStatus = (id: string, status: Status | null) => {
    if (!settings) return;
    const next = { ...settings.roadmap };
    if (status) next[id] = status;
    else delete next[id];
    void update({ roadmap: next });
  };

  const related = selected ? new Set(roadmap.edges.filter((e) => e.source === selected.id || e.target === selected.id).flatMap((e) => [e.source, e.target])) : null;
  const counts = STATUS_ORDER.map((s) => roadmap.nodes.filter((n) => statusOf(n.id).status === s).length);

  return (
    <div className="screen roadmap">
      <header className="screen-head">
        <h1>{t('roadmap.title')}</h1>
        <p className="muted">{t('roadmap.subtitle')}</p>
        {!i18n.language.startsWith('pl') && <p className="muted small">{t('roadmap.polishOnly')}</p>}
      </header>

      <div className="roadmap-legend">
        {STATUS_ORDER.slice()
          .reverse()
          .map((s) => (
            <span key={s} className={`legend-item st-${s}`}>
              <i className="st-dot" /> {t(`roadmap.status.${s}`)} · {counts[STATUS_ORDER.indexOf(s)]}
            </span>
          ))}
        <span className="legend-item">
          <i className="st-auto">≈</i> {t('roadmap.fromData')}
        </span>
      </div>

      <div className="card roadmap-card" ref={wrap}>
        <div className="roadmap-canvas" style={{ width: width * scale, height: (height + 30) * scale }}>
          <div style={{ width, height: height + 30, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}>
            {roadmap.columns.map((c, i) => (
              <div key={i} className="roadmap-col" style={{ left: i * COL_W, width: COL_W }}>
                {i === 0 || roadmap.columns[i - 1] !== c ? c : ''}
              </div>
            ))}
            <svg width={width} height={height + 30} className="roadmap-edges" aria-hidden>
              {roadmap.edges.map((e, i) => {
                const a = byId.get(e.source);
                const b = byId.get(e.target);
                if (!a || !b) return null;
                const pa = pos(a);
                const pb = pos(b);
                const x1 = pa.x + NODE_W;
                const y1 = pa.y + NODE_H / 2 + 30;
                const x2 = pb.x;
                const y2 = pb.y + NODE_H / 2 + 30;
                const mid = (x1 + x2) / 2;
                const on = selected && (e.source === selected.id || e.target === selected.id);
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={on ? '#c9b8ff' : '#3a3d44'}
                    strokeWidth={on ? 2.5 : 1.5}
                    opacity={selected && !on ? 0.45 : 1}
                  />
                );
              })}
            </svg>
            {roadmap.nodes.map((n) => {
              const p = pos(n);
              const st = statusOf(n.id);
              const color = (roadmap.group_colors as Record<string, string>)[n.group] ?? '#e3e6ee';
              const dim = related && !related.has(n.id);
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`rm-node st-${st.status}${selected?.id === n.id ? ' active' : ''}${dim ? ' dim' : ''}`}
                  style={{ left: p.x, top: p.y + 30, width: NODE_W, height: NODE_H, borderTopColor: color }}
                  onClick={() => setSelected(n)}
                  title={n.original_term ?? undefined}
                >
                  <span className="rm-label">{n.label}</span>
                  <i className="st-dot" />
                  {st.fromData && <i className="st-auto">≈</i>}
                  {n.is_new && <span className="rm-new">{t('roadmap.new')}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <div className="card roadmap-detail">
          <div className="rm-detail-head">
            <div>
              <h2 className="rm-title">{selected.label}</h2>
              <span className="muted small">
                {selected.original_term} · {roadmap.columns[selected.column]}
              </span>
            </div>
            <div className="segmented" role="radiogroup" aria-label={t('roadmap.yourStatus')}>
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={settings?.roadmap?.[selected.id] === s}
                  className={settings?.roadmap?.[selected.id] === s ? 'on' : ''}
                  onClick={() => setStatus(selected.id, s)}
                >
                  {t(`roadmap.status.${s}`)}
                </button>
              ))}
            </div>
          </div>
          {auto[selected.id] && (
            <p className="small">
              {t('roadmap.measured', { status: t(`roadmap.status.${auto[selected.id]!.status}`), value: auto[selected.id]!.value })}
              {settings?.roadmap?.[selected.id] && (
                <>
                  {' '}
                  <button type="button" className="link" onClick={() => setStatus(selected.id, null)}>
                    {t('roadmap.useData')}
                  </button>
                </>
              )}
            </p>
          )}
          <dl className="rm-fields">
            {FIELDS.map((k) => (
              <div key={k}>
                <dt>{(roadmap.field_notes as Record<string, string>)[k]}</dt>
                <dd>{(selected as Record<string, unknown>)[k] as string}</dd>
              </div>
            ))}
          </dl>
          <div className="rm-links small">
            <span className="muted">{t('roadmap.needs')}: </span>
            {roadmap.edges
              .filter((e) => e.target === selected.id)
              .map((e) => byId.get(e.source)!)
              .map((n) => (
                <button key={n.id} type="button" className="link" onClick={() => setSelected(n)}>
                  {n.label}
                </button>
              ))
              .reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}
            {' · '}
            <span className="muted">{t('roadmap.leadsTo')}: </span>
            {roadmap.edges
              .filter((e) => e.source === selected.id)
              .map((e) => byId.get(e.target)!)
              .map((n) => (
                <button key={n.id} type="button" className="link" onClick={() => setSelected(n)}>
                  {n.label}
                </button>
              ))
              .reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}
          </div>
        </div>
      )}

      <h2>{t('roadmap.glossary')}</h2>
      <dl className="card glossary">
        {roadmap.glossary.map((g) => (
          <div key={g.term}>
            <dt>{g.term}</dt>
            <dd>{g.definition}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">
        {t('roadmap.source', { author: roadmap.source.author })} {f.num(roadmap.nodes.length)} / {f.num(roadmap.edges.length)}
      </p>
    </div>
  );
}
