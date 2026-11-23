// One HTML page to browse every eval run issue by issue, and mark a suggestion as acceptable or not.
//   bun report.ts   -> .local/report.html (open it in a browser; nothing is published)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, loadIssues } from './src/lib.ts';

const RUNS = join(import.meta.dirname, '.local/runs');
const runs: Record<string, Record<number, { predicted: string[]; seconds: number }>> = {};
for (const f of readdirSync(RUNS).filter(f => f.endsWith('.jsonl')).sort()) {
  const run = (runs[f.replace('.jsonl', '')] = {} as Record<number, { predicted: string[]; seconds: number }>);
  for (const l of readFileSync(join(RUNS, f), 'utf8').split('\n').filter(Boolean)) {
    const { issue, predicted, seconds } = JSON.parse(l);
    run[issue] = { predicted, seconds };
  }
}
const evaluated = new Set(Object.values(runs).flatMap(r => Object.keys(r).map(Number)));
const issues = loadIssues().filter(i => evaluated.has(i.number)).reverse()
  .map(({ number, title, body, createdAt, labels }) => ({ number, title, body, createdAt, labels }));
// "<" escaped: issue bodies are user text and must not close the script element
const data = JSON.stringify({ repo: REPO, runs, issues }).replace(/</g, '\\u003c');

writeFileSync(join(import.meta.dirname, '.local/report.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Label triage runs</title>
<style>
:root { --bg:#fafafa; --fg:#1d1d1f; --muted:#6b6b70; --card:#fff; --line:#e3e3e8; --ok:#1f7a3a; --okbg:#dff3e5; --extra:#9a5b00; --extrabg:#fdeccc; --miss:#8a8a90; --link:#0b62c4; }
@media (prefers-color-scheme: dark) { :root { --bg:#141416; --fg:#ececf0; --muted:#9a9aa2; --card:#1d1d21; --line:#2e2e34; --ok:#7fdc9a; --okbg:#173a23; --extra:#ffc56b; --extrabg:#3d2c0c; --miss:#8a8a90; --link:#6cb2ff; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui, sans-serif; }
header { position:sticky; top:0; z-index:1; background:var(--bg); border-bottom:1px solid var(--line); padding:12px 16px; }
h1 { font-size:17px; margin:0 0 8px; }
.runs { display:flex; flex-wrap:wrap; gap:6px 14px; margin-bottom:8px; }
.runs label { white-space:nowrap; } .runs small { color:var(--muted); }
.bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
input[type=search], select, button { font:inherit; color:inherit; background:var(--card); border:1px solid var(--line); border-radius:6px; padding:4px 8px; }
button { cursor:pointer; }
main { padding:12px 16px; max-width:1100px; margin:auto; }
.issue { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:10px; }
.issue a { color:var(--link); text-decoration:none; font-weight:600; } .issue a:hover { text-decoration:underline; }
.meta { color:var(--muted); font-size:12px; }
details summary { cursor:pointer; color:var(--muted); font-size:12px; margin-top:4px; }
pre { white-space:pre-wrap; word-break:break-word; font:12px/1.4 ui-monospace, monospace; max-height:300px; overflow:auto; background:var(--bg); padding:8px; border-radius:6px; }
.row { display:grid; grid-template-columns:150px 1fr auto; gap:8px; align-items:center; padding:4px 0; border-top:1px dashed var(--line); }
.row:first-of-type { border-top:0; }
.name { font-family:ui-monospace, monospace; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
.chip { display:inline-block; font-size:12px; padding:1px 7px; border-radius:10px; margin:2px 3px 2px 0; border:1px solid transparent; }
.actual { background:var(--bg); border-color:var(--line); }
.ok { background:var(--okbg); color:var(--ok); }
.extra { background:var(--extrabg); color:var(--extra); }
.miss { color:var(--miss); border:1px dashed var(--miss); text-decoration:line-through; }
.v button { padding:2px 8px; } .v button.on.good { background:var(--okbg); color:var(--ok); } .v button.on.bad { background:var(--extrabg); color:var(--extra); }
.legend { color:var(--muted); font-size:12px; }
@media (max-width:640px) { .row { grid-template-columns:1fr; } }
</style></head><body>
<header>
  <h1>Label triage runs (newest issues first)</h1>
  <div class="runs" id="runs"></div>
  <div class="bar">
    <input type="search" id="q" placeholder="filter: title, number, label">
    <select id="show">
      <option value="all">all issues</option>
      <option value="notexact">a selected run is not exact</option>
      <option value="todo">a selected run is not exact and not judged</option>
      <option value="nodomain">no domain label on GitHub</option>
    </select>
    <button id="export">export judgements</button>
    <span class="legend"><span class="chip ok">matches</span><span class="chip extra">suggested, not on GitHub</span><span class="chip miss">on GitHub, not suggested</span> · 👍 acceptable anyway / 👎 wrong (kept in this browser)</span>
  </div>
</header>
<main id="list"></main>
<script>
const D = ${data};
const KEY = 'label-triager-judgements';
let J = {}; try { J = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(J)); } catch {} };
const names = Object.keys(D.runs);

let selected = new Set(names);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const exact = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const chip = (l, cls) => '<span class="chip ' + cls + '">' + esc(l) + '</span>';

function stats(run) {
  let n = 0, ex = 0, good = 0, bad = 0;
  for (const i of D.issues) { const r = D.runs[run][i.number]; if (!r) continue; n++;
    if (exact(r.predicted, i.labels)) ex++; else if (J[run + ':' + i.number] === 'good') good++; else if (J[run + ':' + i.number] === 'bad') bad++; }
  return { n, ex, good, bad };
}
function drawRuns() {
  document.getElementById('runs').innerHTML = names.map(n => { const s = stats(n);
    return '<label><input type="checkbox" value="' + esc(n) + '"' + (selected.has(n) ? ' checked' : '') + '> ' + esc(n) +
      ' <small>exact ' + s.ex + '/' + s.n + (s.good || s.bad ? ', +' + s.good + ' 👍 ' + s.bad + ' 👎' : '') + '</small></label>'; }).join('');
}
function draw() {
  const q = document.getElementById('q').value.toLowerCase(), show = document.getElementById('show').value;
  const runs = names.filter(n => selected.has(n));
  const html = [];
  for (const i of D.issues) {
    const rows = runs.filter(r => D.runs[r][i.number]);
    if (q && !(i.number + ' ' + i.title + ' ' + i.labels.join(' ') + ' ' + rows.flatMap(r => D.runs[r][i.number].predicted).join(' ')).toLowerCase().includes(q)) continue;
    const notExact = rows.filter(r => !exact(D.runs[r][i.number].predicted, i.labels));
    if (show === 'notexact' && !notExact.length) continue;
    if (show === 'todo' && !notExact.some(r => !J[r + ':' + i.number])) continue;
    if (show === 'nodomain' && i.labels.some(l => l.startsWith('domain/'))) continue;
    html.push('<div class="issue"><a href="https://github.com/' + D.repo + '/issues/' + i.number + '" target="_blank" rel="noopener">#' + i.number + ' ' + esc(i.title) + '</a> <span class="meta">' + i.createdAt.slice(0, 10) + '</span>' +
      '<div>' + i.labels.map(l => chip(l, 'actual')).join('') + '</div>' +
      '<details><summary>body</summary><pre>' + esc(i.body || '(empty)') + '</pre></details>' +
      rows.map(r => { const p = D.runs[r][i.number].predicted, k = r + ':' + i.number, ex = exact(p, i.labels);
        const chips = p.map(l => chip(l, i.labels.includes(l) ? 'ok' : 'extra')).join('') + i.labels.filter(l => !p.includes(l)).map(l => chip(l, 'miss')).join('');
        return '<div class="row"><span class="name">' + esc(r) + ' · ' + D.runs[r][i.number].seconds.toFixed(1) + 's</span><span>' + (chips || '<span class="meta">nothing</span>') + '</span>' +
          (ex ? '<span class="meta">exact</span>' : '<span class="v" data-k="' + esc(k) + '"><button class="good' + (J[k] === 'good' ? ' on' : '') + '">👍</button> <button class="bad' + (J[k] === 'bad' ? ' on' : '') + '">👎</button></span>') + '</div>'; }).join('') +
      '</div>');
  }
  document.getElementById('list').innerHTML = html.join('') || '<p class="meta">no issue matches</p>';
}
document.getElementById('runs').addEventListener('change', e => { e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value); draw(); });
document.getElementById('q').addEventListener('input', draw);
document.getElementById('show').addEventListener('change', draw);
document.getElementById('list').addEventListener('click', e => {
  const b = e.target.closest('.v button'); if (!b) return;
  const k = b.parentElement.dataset.k, v = b.classList.contains('good') ? 'good' : 'bad';
  if (J[k] === v) delete J[k]; else J[k] = v;
  save(); drawRuns(); b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', J[k] === (x.classList.contains('good') ? 'good' : 'bad')));
});
document.getElementById('export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(J, null, 2)], { type: 'application/json' }));
  a.download = 'judgements.json'; a.click();
});
drawRuns(); draw();
</script></body></html>
`);
console.log(`${issues.length} issues, ${Object.keys(runs).length} runs: ${join(import.meta.dirname, '.local/report.html')}`);
