// Collect labels and the last issues of podman-desktop/podman-desktop into .local/data/. Read-only: gh GETs only.
//   bun collect.ts [--limit 500]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, REPO, toIssue, toLabels } from './src/lib.ts';

const limit = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 500;
const gh = (...args: string[]): string => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] });

rmSync(join(DATA, 'issues'), { recursive: true, force: true });
mkdirSync(join(DATA, 'issues'), { recursive: true });
const labels = toLabels(JSON.parse(gh('label', 'list', '-R', REPO, '--limit', '500', '--json', 'name,description')));
writeFileSync(join(DATA, 'labels.json'), JSON.stringify(labels, null, 2));
// which code folder belongs to which domain, kept by issue-management/pdmn-dsktp-app
writeFileSync(join(DATA, 'folder-domains.json'), Buffer.from(gh('api', 'repos/issue-management/pdmn-dsktp-app/contents/folder-domains.json', '--jq', '.content'), 'base64'));

let kept = 0;
for (const raw of JSON.parse(gh('issue', 'list', '-R', REPO, '--state', 'all', '--limit', String(limit), '--json', 'number,title,body,createdAt,labels'))) {
  const issue = toIssue(raw);
  // every issue gets a domain: one without a domain label was not triaged, no ground truth
  if (!issue.labels.some(l => l.startsWith('domain/'))) continue;
  writeFileSync(join(DATA, 'issues', `${issue.number}.json`), JSON.stringify(issue, null, 2));
  kept++;
}
console.log(`${Object.keys(labels).length} labels, ${kept} issues with a domain label among the last ${limit} in ${DATA}`);
