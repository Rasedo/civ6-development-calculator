/**
 * Live training dashboard: a dependency-free HTTP server the trainer runs
 * alongside itself. Serves one self-contained chart page (canvas, dark) at
 * `/` and the current history as JSON at `/data`; the page polls every 2 s.
 */

import { createServer, type Server } from 'node:http';

/** One row per generation (kept in the checkpoint, streamed to the page). */
export interface GenStat {
  gen: number;
  /** Population fitness mean / max / std this generation. */
  fit: number;
  fitMax: number;
  fitStd: number;
  /** Held-out score when evaluated this generation, else null. */
  held: number | null;
  /** Best held-out so far. */
  best: number;
  /** Gradient and parameter L2 norms (optimizer health). */
  gnorm: number;
  tnorm: number;
  /** Instantaneous episodes/sec for this generation. */
  eps: number;
  /** Seconds since training started. */
  t: number;
}

export function startDashboard(port: number, getData: () => unknown): Server | null {
  const server = createServer((req, res) => {
    if (req.url === '/data') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(getData()));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  server.on('error', (err) => {
    console.log(`(dashboard disabled: ${(err as NodeJS.ErrnoException).code ?? err.message} on port ${port})`);
  });
  server.listen(port, () => {
    console.log(`Dashboard: http://localhost:${port}`);
  });
  return server;
}

const PAGE = /* html */ `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>ES training</title>
<style>
  body { background:#14171c; color:#d7dde6; font:13px/1.5 system-ui,sans-serif; margin:0; padding:16px 20px; }
  h1 { font-size:16px; margin:0 0 4px; }
  #hdr { color:#8b95a3; margin-bottom:14px; }
  #hdr b { color:#d7dde6; }
  .verdict-up { color:#5ec46a; font-weight:600; }
  .verdict-flat { color:#c4a75e; font-weight:600; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; max-width:1200px; }
  .wide { grid-column:1 / -1; }
  .card { background:#1b1f26; border:1px solid #2a303a; border-radius:8px; padding:10px 12px 6px; }
  .card h2 { font-size:12px; font-weight:600; color:#8b95a3; margin:0 0 6px; text-transform:uppercase; letter-spacing:.05em; }
  canvas { width:100%; height:190px; display:block; }
  .wide canvas { height:240px; }
</style>
</head>
<body>
<h1>Evolution-strategy training</h1>
<div id="hdr">connecting…</div>
<div class="grid">
  <div class="card wide"><h2>Training fitness (mean · EMA · max)</h2><canvas id="fit"></canvas></div>
  <div class="card"><h2>Held-out score · best so far</h2><canvas id="held"></canvas></div>
  <div class="card"><h2>Episodes / sec (per generation)</h2><canvas id="eps"></canvas></div>
  <div class="card"><h2>Gradient norm</h2><canvas id="gnorm"></canvas></div>
  <div class="card"><h2>Weight norm</h2><canvas id="tnorm"></canvas></div>
</div>
<script>
const fmt = (v) => Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3);

function ema(vals, alpha) {
  const out = []; let acc = 0;
  vals.forEach((v, i) => { acc = i === 0 ? v : alpha * v + (1 - alpha) * acc; out.push(acc); });
  return out;
}
function slope(vals) {
  const n = vals.length; if (n < 2) return 0;
  const xm = (n - 1) / 2, ym = vals.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xm) * (vals[i] - ym); den += (i - xm) * (i - xm); }
  return den ? num / den : 0;
}

// series: [{color, width?, dash?, points:[[x,y],...] , label}]
function draw(id, series) {
  const c = document.getElementById(id);
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, W, H);
  const pts = series.flatMap(s => s.points);
  if (pts.length === 0) return;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [x, y] of pts) {
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) { ymax += 1; ymin -= 1; }
  const pad = (ymax - ymin) * 0.08; ymin -= pad; ymax += pad;
  const L = 44, R = 8, T = 6, B = 18;
  const px = (x) => L + ((x - xmin) / (xmax - xmin)) * (W - L - R);
  const py = (y) => T + (1 - (y - ymin) / (ymax - ymin)) * (H - T - B);
  // gridlines + y labels
  g.strokeStyle = '#262c36'; g.fillStyle = '#68737f'; g.font = '10px system-ui'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = ymin + (i / 4) * (ymax - ymin);
    g.beginPath(); g.moveTo(L, py(y)); g.lineTo(W - R, py(y)); g.stroke();
    g.fillText(fmt(y), L - 4, py(y) + 3);
  }
  g.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const x = xmin + (i / 4) * (xmax - xmin);
    g.fillText(fmt(x), px(x), H - 4);
  }
  for (const s of series) {
    if (s.points.length === 0) continue;
    g.strokeStyle = s.color; g.lineWidth = s.width || 1.2;
    g.setLineDash(s.dash || []);
    if (s.points.length === 1 || s.dots) {
      g.fillStyle = s.color;
      for (const [x, y] of s.points) { g.beginPath(); g.arc(px(x), py(y), 2.4, 0, 7); g.fill(); }
    }
    g.beginPath();
    s.points.forEach(([x, y], i) => (i === 0 ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y))));
    g.stroke();
    g.setLineDash([]);
  }
  // legend
  let lx = L + 8; g.font = '10px system-ui'; g.textAlign = 'left';
  for (const s of series) {
    if (!s.label) continue;
    g.fillStyle = s.color; g.fillRect(lx, T + 2, 10, 3);
    g.fillStyle = '#8b95a3'; g.fillText(s.label, lx + 14, T + 7);
    lx += 14 + g.measureText(s.label).width + 14;
  }
}

async function tick() {
  try {
    const d = await (await fetch('/data')).json();
    const h = d.history || [];
    const gens = h.map(r => r.gen);
    const fit = h.map(r => r.fit);
    const sm = ema(fit, 0.08);
    const win = Math.max(10, Math.floor(sm.length * 0.3));
    const trend = slope(sm.slice(-win)) * 100;
    const verdict = h.length < 15
      ? '(warming up)'
      : trend > 0.5
        ? '<span class="verdict-up">climbing ' + (trend >= 0 ? '+' : '') + trend.toFixed(1) + ' / 100 gens</span>'
        : trend < -0.5
          ? '<span class="verdict-flat">declining ' + trend.toFixed(1) + ' / 100 gens</span>'
          : '<span class="verdict-flat">≈ flat (' + trend.toFixed(1) + ' / 100 gens)</span>';
    const last = h[h.length - 1];
    document.getElementById('hdr').innerHTML = last
      ? 'gen <b>' + last.gen + '</b> / ' + d.gens +
        ' · fitness EMA <b>' + fmt(sm[sm.length - 1]) + '</b> · ' + verdict +
        ' · best held-out <b>' + (d.bestHeldOut == null ? '—' : fmt(d.bestHeldOut)) + '</b>' +
        ' · <b>' + fmt(last.eps) + '</b> eps/s · ' + (last.t / 60).toFixed(0) + ' min' +
        ' · ' + d.arch + ' ' + d.dim + ' params, pop ' + d.config.pop + ' × ' + d.config.seedsPerGen + ' seeds'
      : 'waiting for the first generation…';
    draw('fit', [
      { color: '#3d4654', points: h.map(r => [r.gen, r.fit]), label: 'mean' },
      { color: '#4a90d9', width: 2, points: gens.map((g, i) => [g, sm[i]]), label: 'EMA' },
      { color: '#33608c', dash: [4, 4], points: h.map(r => [r.gen, r.fitMax]), label: 'max' },
    ]);
    draw('held', [
      { color: '#5ec46a', dots: true, points: h.filter(r => r.held !== null).map(r => [r.gen, r.held]), label: 'held-out' },
      { color: '#2e7a38', dash: [4, 4], points: h.map(r => [r.gen, r.best]), label: 'best' },
    ]);
    draw('eps', [{ color: '#c4a75e', points: h.map(r => [r.gen, r.eps]) }]);
    draw('gnorm', [{ color: '#b05fb0', points: h.map(r => [r.gen, r.gnorm]) }]);
    draw('tnorm', [{ color: '#d9764a', points: h.map(r => [r.gen, r.tnorm]) }]);
  } catch (e) {
    document.getElementById('hdr').textContent = 'trainer not responding — is it still running?';
  }
  setTimeout(tick, 2000);
}
tick();
</script>
</body>
</html>`;
