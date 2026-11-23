import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const REPO = 'podman-desktop/podman-desktop';
export const DATA = join(import.meta.dirname, '../.local/data');

export type Issue = { number: number; title: string; body: string; createdAt: string; labels: string[] };
export type Labels = Record<string, { names: string[]; description: string }>;
export type Mapping = { pattern: string; domain: string };
// what `gh issue view/list --json number,title,body,labels,createdAt` and `gh label list --json name,description` print
export type RawIssue = { number: number; title: string; body: string; createdAt: string; labels: { name: string }[] };
export type RawLabel = { name: string; description: string };

// "area/renderer 📈" -> "area/renderer": the model sees plain keys, and two labels that differ by an emoji are one
export const key = (name: string): string => name.replace(/[^\x20-\x7e]/g, '').trim().toLowerCase();

// candidate labels: domain/* and area/*, without review state (domain/x/inreview) and PR-only ones
export const isCandidate = (name: string): boolean =>
  /^(domain|area)\//i.test(name) && !/\/(inreview|reviewed)$/.test(key(name)) && !/^(area\/e2e-full|domain\/dependency-)/.test(key(name));

// what a model cannot use: comments, pictures, checklists; cut short because prompt eval dominates on CPU
export const cleanBody = (body: string, max = 2000): string =>
  String(body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)|<img[^>]*>|<video[\s\S]*?<\/video>/g, '')
    .replace(/^\s*[-*] \[[ xX]\].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

export const toIssue = (i: RawIssue): Issue => ({
  number: i.number, title: i.title, body: cleanBody(i.body), createdAt: i.createdAt,
  labels: [...new Set(i.labels.map(l => l.name).filter(isCandidate).map(key))].sort(),
});

// hand-written descriptions (descriptions.json) win over the GitHub ones, which are mostly empty
const written: Record<string, string> = JSON.parse(readFileSync(join(import.meta.dirname, '../descriptions.json'), 'utf8'));
// in the order of descriptions.json: what is offered first when there are more options than the model takes
const ordered = (labels: Labels): Labels => {
  const rank = (k: string): number => { const i = Object.keys(written).indexOf(k); return i < 0 ? Infinity : i; };
  return Object.fromEntries(Object.entries(labels).sort(([a], [b]) => rank(a) - rank(b)));
};
export function toLabels(raw: RawLabel[]): Labels {
  const labels: Labels = {};
  for (const { name, description } of raw.filter(l => isCandidate(l.name))) {
    const k = key(name);
    labels[k] ??= { names: [], description: '' };
    labels[k].names.push(name);
    labels[k].description = written[k] ?? (labels[k].description || description || '');
  }
  return ordered(labels);
}

// folder-domains.json (issue-management/pdmn-dsktp-app): which folder of the code belongs to which domain
export const toMappings = (raw: any[], repo = REPO): Mapping[] => raw
  .filter(r => r.repository === '*' || String(r.repository).endsWith(`/${repo}`))
  .reverse() // repository rules before the generic ones
  .flatMap(r => [...(r.mappings ?? []), ...(r.globalMappings ?? [])]);

export const loadLabels = (): Labels => ordered(JSON.parse(readFileSync(join(DATA, 'labels.json'), 'utf8')));
export const loadMappings = (): Mapping[] => toMappings(JSON.parse(readFileSync(join(DATA, 'folder-domains.json'), 'utf8')));
// oldest first
export const loadIssues = (): Issue[] =>
  readdirSync(join(DATA, 'issues'))
    .map(f => JSON.parse(readFileSync(join(DATA, 'issues', f), 'utf8')) as Issue)
    .sort((a, b) => a.number - b.number);
