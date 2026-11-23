// Replay collected issues through triage.ts and compare with the labels they really got.
//   bun eval.ts [--model d3:2b] [--url u] [--test 100] [--only n]
//   bun eval.ts --compare
// Test set = the newest `--test` issues; each one only sees older issues as examples. Resumable.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadIssues, loadLabels, loadMappings } from './src/lib.ts';
import { score, type Row } from './src/score.ts';
import { options, triage, type Stats } from './triage.ts';

const RUNS = join(import.meta.dirname, '.local/runs');
mkdirSync(RUNS, { recursive: true });
type Line = Row & { issue: number; title: string } & Stats;
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const read = (f: string): Line[] => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

function summary(lines: Line[]): Record<string, string> {
  const d = score(lines, 'domain/'), a = score(lines, 'area/'), all = score(lines);
  const avg = (f: (l: Line) => number): number => lines.reduce((s, l) => s + f(l), 0) / (lines.length || 1);
  return {
    issues: String(lines.length),
    'domain P/R': `${pct(d.micro.precision)}/${pct(d.micro.recall)}`,
    'domain exact': pct(d.exact),
    // the picked domain is one of the expected ones (top-1 accuracy with one domain)
    'domain ok': pct(lines.filter(l => l.predicted.some(p => p.startsWith('domain/') && l.expected.includes(p))).length / (lines.length || 1)),
    // the specific extension labels (area/extension/*, area/extensions/compose) are exactly right, none included
    'ext ok': pct(score(lines.map(l => ({ expected: l.expected.filter(x => /^area\/extensions?\/./.test(x)), predicted: l.predicted.filter(x => /^area\/extensions?\/./.test(x)) }))).exact),
    'area P/R': `${pct(a.micro.precision)}/${pct(a.micro.recall)}`,
    'all F1': pct(all.micro.f1),
    'all exact': pct(all.exact),
    's/issue': avg(l => l.seconds).toFixed(1),
    'prompt tok': avg(l => l.promptTokens).toFixed(0),
  };
}
const table = (rows: Record<string, string>[]): string => {
  const cols = Object.keys(rows[0] ?? {});
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map(r => `| ${cols.map(c => r[c]).join(' | ')} |`)].join('\n');
};

const argv = process.argv.slice(2);
if (argv.includes('--compare')) {
  console.log(table(readdirSync(RUNS).filter(f => f.endsWith('.jsonl')).map(f => ({ run: f.replace('.jsonl', ''), ...summary(read(join(RUNS, f))) }))));
  process.exit(0);
}

const o = options(argv);
const num = (name: string, fallback: number): number => { const i = argv.indexOf(`--${name}`); return i >= 0 ? Number(argv[i + 1]) : fallback; };
const labels = loadLabels(), issues = loadIssues(), mappings = loadMappings();
const test = issues.slice(-num('test', 100)).slice(0, num('only', Infinity));
const name = o.model.replace(/[^\w.-]/g, '_');
const file = join(RUNS, `${name}.jsonl`);
const done = new Set(existsSync(file) ? read(file).map(l => l.issue) : []);

for (const [n, issue] of test.entries()) {
  if (done.has(issue.number)) continue;
  const { labels: predicted, stats } = await triage(issue, { ...o, labels, mappings, pool: issues.filter(p => p.number < issue.number) });
  appendFileSync(file, JSON.stringify({ issue: issue.number, title: issue.title, expected: issue.labels, predicted, ...stats }) + '\n');
  const ok = predicted.join() === issue.labels.join() ? '=' : predicted.some(l => issue.labels.includes(l)) ? '~' : 'x';
  console.log(`${n + 1}/${test.length} ${ok} ${issue.number} ${stats.seconds.toFixed(1)}s  got ${predicted.join(', ') || '-'}  want ${issue.labels.join(', ')}`);
}

// report: only the issues of this test set, even if the file holds more
const lines = read(file).filter(l => test.some(t => t.number === l.issue));
const per = score(lines).perLabel;
const confusions = new Map<string, number>();
for (const l of lines) for (const p of l.predicted.filter(x => !l.expected.includes(x))) for (const e of l.expected.filter(x => !l.predicted.includes(x) && x.split('/')[0] === p.split('/')[0]))
  confusions.set(`${e} → ${p}`, (confusions.get(`${e} → ${p}`) ?? 0) + 1);
const report = [
  `# ${name}`, table([summary(lines)]),
  '## Per label', table(Object.entries(per).sort((a, b) => b[1].tp + b[1].fn - (a[1].tp + a[1].fn)).map(([l, s]) =>
    ({ label: l, expected: String(s.tp + s.fn), predicted: String(s.tp + s.fp), precision: pct(s.precision), recall: pct(s.recall) }))),
  '## Most frequent confusions (expected → predicted)', [...confusions].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, n]) => `- ${c}: ${n}`).join('\n'),
].join('\n\n');
writeFileSync(join(RUNS, `${name}.md`), report + '\n');
console.log(`\n${table([summary(lines)])}\n\nreport: ${join(RUNS, `${name}.md`)}`);
