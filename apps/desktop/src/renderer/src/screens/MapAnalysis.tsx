import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalyzeResult, MapAnalysis as Analysis } from '../../../shared/api.ts';
import Stat from '../components/Stat.tsx';
import { formatTime, makeFormatters } from '../format.ts';
import { useFileDrop } from '../hooks/useFileDrop.ts';

export default function MapAnalysis() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResult>(null);
  const { num } = makeFormatters(i18n.language);

  async function run(job: () => Promise<AnalyzeResult>) {
    setBusy(true);
    try {
      const r = await job();
      if (r) setResult(r);
    } finally {
      setBusy(false);
    }
  }

  const dragging = useFileDrop((paths) => {
    const file = paths.find((p) => p.toLowerCase().endsWith('.osu')) ?? paths[0]!;
    void run(() => window.api.analyzeMapFile(file));
  });

  return (
    <div className={`screen${dragging ? ' dragging' : ''}`}>
      <header className="screen-head">
        <h1>{t('map.title')}</h1>
        <p className="muted">{t('map.subtitle')}</p>
      </header>

      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void run(() => window.api.pickAndAnalyzeMap({ pickMap: t('map.pick') }))}
        >
          {busy ? t('map.analyzing') : t('map.pick')}
        </button>
        <span className="muted small">{t('map.dropHint')}</span>
      </div>

      {result && !result.ok && (
        <div className="card error">{result.error === 'not-osu-file' ? t('map.notOsu') : t('map.error', { message: result.error })}</div>
      )}
      {result?.ok && <Report a={result.analysis} num={num} />}
    </div>
  );
}

function Report({ a, num }: { a: Analysis; num: (v: number, d?: number) => string }) {
  const { t } = useTranslation();
  const s = a.streams;
  const maxBin = Math.max(1, ...s.lengthHistogram.map((b) => b.count));
  const maxBlock = s.longestBlocks[0]?.durationMs ?? 1;

  return (
    <div className="report">
      <div className="card map-title">
        <div>
          <div className="map-name">
            {a.artist} – {a.title}
          </div>
          <div className="muted">
            [{a.version}] · {a.creator}
          </div>
        </div>
        <div className="chips">
          <span className="chip">{t('map.settings', { cs: num(a.cs, 1), ar: num(a.ar, 1), od: num(a.od, 1) })}</span>
          <span className="chip">
            {t('map.length')}: {formatTime(a.lengthMs)}
          </span>
          <span className="chip">
            {t('map.objects')}: {num(a.objects)}
          </span>
        </div>
      </div>

      <h2>{t('map.sectionStreams')}</h2>
      <div className="grid">
        <Stat label={t('map.streamTime')} value={t('common.seconds', { value: num(s.totalMs / 1000) })} />
        <Stat label={t('map.streamShare')} value={`${num(s.percentOfObjects)}%`} />
        <Stat label={t('map.streamBpm')} value={s.notes ? num(s.bpm) : t('map.none')} />
        <Stat label={t('map.streamMedian')} value={t('common.notes', { count: s.medianLength })} />
        <Stat label={t('map.spacing')} value={num(s.spacing, 2)} hint={t('map.spacingHint')} />
        <Stat
          label={t('map.longestStream')}
          value={s.longest ? t('common.notes', { count: s.longest.notes }) : t('map.none')}
          hint={
            s.longest
              ? t('map.longestStreamValue', {
                  seconds: num(s.longest.durationMs / 1000, 1),
                  at: formatTime(s.longest.startMs),
                  spacing: num(s.longest.spacing, 2)
                })
              : undefined
          }
        />
      </div>

      <div className="two-col">
        <div className="card">
          <h3>{t('map.blocks')}</h3>
          <p className="muted small">{t('map.blocksHint')}</p>
          {s.longestBlocks.length === 0 && <p className="muted">{t('map.none')}</p>}
          {s.longestBlocks.map((b) => (
            <div key={b.startMs} className="bar-row">
              <span className="bar-label">{t('map.blockRow', { at: formatTime(b.startMs), end: formatTime(b.endMs) })}</span>
              <span className="bar">
                <span className="bar-fill" style={{ width: `${(b.durationMs / maxBlock) * 100}%` }} />
              </span>
              <span className="bar-value">
                {t('common.seconds', { value: num(b.durationMs / 1000, 1) })} · {t('common.notes', { count: b.notes })}
              </span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>{t('map.histogram')}</h3>
          <div className="histogram">
            {s.lengthHistogram.map((b) => (
              <div key={b.range} className="hist-col">
                <span className="hist-count">{b.count}</span>
                <span className="hist-bar" style={{ height: `${(b.count / maxBin) * 100}%` }} />
                <span className="hist-label">{b.range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2>{t('map.sectionJumps')}</h2>
      <div className="grid">
        <Stat label={t('map.jumps15')} value={num(a.jumps.jumpsOver1_5Diameters)} />
        <Stat label={t('map.jumps3')} value={num(a.jumps.jumpsOver3Diameters)} />
        <Stat label={t('map.jumpsAvg')} value={t('map.diameters', { value: num(a.jumps.averageHalfBeatDistance, 2) })} />
      </div>

      <h2>{t('map.sectionReading')}</h2>
      <div className="grid">
        <Stat label={t('map.overlap')} value={`${num(a.reading.overlapPercent)}%`} hint={t('map.overlapHint')} />
        <Stat label={t('map.beatsAhead')} value={num(a.reading.beatsVisibleAhead, 2)} />
        <Stat label={t('map.visible')} value={num(a.reading.averageVisibleObjects, 1)} />
        <Stat label={t('map.preempt')} value={t('map.ms', { value: num(a.reading.preemptMs) })} />
      </div>
    </div>
  );
}
