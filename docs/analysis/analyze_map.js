// Referencyjny analizator mapy osu! (standard) – streamy, bloki, spacing, skoki, nakładanie nut.
// Użycie: node analyze_map.js "ścieżka/do/mapy.osu"
// Wzory opisane w SPEC.md, sekcje 5.1–5.3. Port do TypeScript trafia do packages/analyzer.

const fs = require('fs');

function parse(text) {
  let sec = '', tps = [], objs = [], meta = {};
  for (let l of text.split(/\r?\n/)) {
    l = l.trim();
    if (!l || l.startsWith('//')) continue;
    if (l.startsWith('[')) { sec = l; continue; }
    if ((sec === '[Metadata]' || sec === '[Difficulty]') && l.includes(':')) {
      const i = l.indexOf(':'); meta[l.slice(0, i)] = l.slice(i + 1).trim();
    } else if (sec === '[TimingPoints]') {
      const p = l.split(',');
      const uninherited = p.length > 6 ? p[6] === '1' : +p[1] > 0;
      if (uninherited) tps.push([+p[0], +p[1]]);
    } else if (sec === '[HitObjects]') {
      const p = l.split(','); const type = +p[3];
      if (type & 8) continue; // spinner
      let ex = +p[0], ey = +p[1];
      if (type & 2) { // slider: koniec dla nieparzystej liczby powtórzeń
        const pts = p[5].split('|').slice(1).map((s) => s.split(':').map(Number));
        if (pts.length && (+p[6]) % 2 === 1) { ex = pts[pts.length - 1][0]; ey = pts[pts.length - 1][1]; }
      }
      objs.push({ t: +p[2], x: +p[0], y: +p[1], ex, ey, slider: !!(type & 2) });
    }
  }
  return { meta, tps, objs };
}

function analyze(text) {
  const { meta, tps, objs } = parse(text);
  const cs = +meta.CircleSize, ar = meta.ApproachRate !== undefined ? +meta.ApproachRate : +meta.OverallDifficulty;
  const R = 54.4 - 4.48 * cs;
  const preempt = ar > 5 ? 1200 - 750 * (ar - 5) / 5 : 1200 + 600 * (5 - ar) / 5;
  const beatAt = (t) => { let b = tps[0][1]; for (const [tt, bb] of tps) if (tt <= t + 1) b = bb; return b; };
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // streamy: odstęp <= 1.15 × 1/4 uderzenia, min. 5 nut
  const runs = []; let cur = [objs[0]];
  for (let i = 1; i < objs.length; i++) {
    const a = objs[i - 1], b = objs[i];
    if (b.t - a.t <= beatAt(a.t) / 4 * 1.15) cur.push(b);
    else { if (cur.length >= 5) runs.push(cur); cur = [b]; }
  }
  if (cur.length >= 5) runs.push(cur);
  const S = runs.map((s) => {
    const gaps = s.slice(1).map((b, i) => b.t - s[i].t).sort((x, y) => x - y);
    const dist = s.slice(1).map((b, i) => Math.hypot(b.x - s[i].x, b.y - s[i].y));
    return { start: s[0].t / 1000, n: s.length, dur: (s[s.length - 1].t - s[0].t) / 1000,
      bpm: 60000 / (4 * (gaps.length % 2 ? gaps[gaps.length >> 1] : (gaps[(gaps.length >> 1) - 1] + gaps[gaps.length >> 1]) / 2)), spacing: dist.reduce((x, y) => x + y, 0) / dist.length / (2 * R) };
  });
  // bloki: streamy z przerwami < 1 s
  const blocks = []; let bl = [S[0]];
  for (const x of S.slice(1)) {
    const last = bl[bl.length - 1];
    if (x.start - (last.start + last.dur) < 1) bl.push(x); else { blocks.push(bl); bl = [x]; }
  }
  blocks.push(bl);
  const blockInfo = blocks.map((b) => ({ at: fmt(b[0].start), seconds: +(b[b.length - 1].start + b[b.length - 1].dur - b[0].start).toFixed(1), notes: b.reduce((a, x) => a + x.n, 0) }))
    .sort((a, b) => b.seconds - a.seconds);
  const streamNotes = S.reduce((a, x) => a + x.n, 0);
  const sorted = S.map((x) => x.n).sort((a, b) => a - b);
  const top = [...S].sort((a, b) => b.n - a.n)[0];

  // skoki na 1/2
  let jumps = 0, bigJumps = 0; const d12 = [];
  for (let i = 1; i < objs.length; i++) {
    const g = objs[i].t - objs[i - 1].t, q = beatAt(objs[i - 1].t);
    if (g > q / 4 * 1.15 && g <= q / 2 * 1.15) {
      const d = Math.hypot(objs[i].x - objs[i - 1].x, objs[i].y - objs[i - 1].y);
      d12.push(d / (2 * R)); if (d > 3 * R) jumps++; if (d > 6 * R) bigJumps++;
    }
  }
  // nakładanie: niesąsiednia nuta w promieniu 2R, zanim pierwsza zniknie
  let overlap = 0, visible = 0;
  for (let i = 0; i < objs.length; i++) {
    let o = false;
    for (let j = i + 1; j < objs.length && objs[j].t - objs[i].t < preempt; j++) {
      visible++;
      if (j > i + 1) { const d = Math.hypot(objs[j].x - objs[i].x, objs[j].y - objs[i].y); if (d < 2 * R && d > 2) o = true; }
    }
    if (o) overlap++;
  }
  const length = (objs[objs.length - 1].t - objs[0].t) / 1000;
  return {
    map: `${meta.Artist} - ${meta.Title} [${meta.Version}]`, cs, ar, od: +meta.OverallDifficulty,
    length_s: Math.round(length), objects: objs.length,
    stream_bpm: Math.round(S.reduce((a, x) => a + x.bpm * x.n, 0) / streamNotes),
    stream_seconds: Math.round(S.reduce((a, x) => a + x.dur, 0)),
    stream_pct_objects: Math.round(streamNotes / objs.length * 100),
    median_stream: sorted[sorted.length >> 1],
    longest_stream: { notes: top.n, seconds: +top.dur.toFixed(1), at: fmt(top.start), spacing: +top.spacing.toFixed(2) },
    longest_blocks: blockInfo.slice(0, 4),
    spacing_avg: +(S.reduce((a, x) => a + x.spacing * x.n, 0) / streamNotes).toFixed(2),
    jumps_half_beat_over_1_5d: jumps, jumps_half_beat_over_3d: bigJumps,
    avg_half_beat_distance_d: +(d12.reduce((a, x) => a + x, 0) / d12.length).toFixed(2),
    overlap_pct: Math.round(overlap / objs.length * 100),
    beats_visible_ahead: +(preempt / beatAt(objs[0].t)).toFixed(2),
    avg_visible_objects: +(visible / objs.length).toFixed(1)
  };
}

if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('Podaj ścieżkę do pliku .osu'); process.exit(1); }
  console.log(JSON.stringify(analyze(fs.readFileSync(f, 'utf8')), null, 2));
}
module.exports = { analyze, parse };
