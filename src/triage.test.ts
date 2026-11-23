import { expect, test } from 'bun:test';
import { examples, folderHints, offered, pick } from '../triage.ts';
import { toIssue, toLabels, toMappings } from './lib.ts';

test('one domain, areas only above 0.3 and when none does not win', () => {
  expect(pick({ 'domain/a': 0.2, 'domain/b': 0.7 }, { none: 0.1, 'area/x': 0.5, 'area/y': 0.35, 'area/z': 0.31 })).toEqual(['domain/b', 'area/x', 'area/y']);
  expect(pick({ 'domain/a': 1 }, { none: 0.6, 'area/x': 0.4 })).toEqual(['domain/a']);
  expect(pick({ 'domain/a': 1 }, { none: 0.2, 'area/x': 0.25 })).toEqual(['domain/a']);
});

test('a specific extension label only when the issue names it', () => {
  const labels = toLabels([{ name: 'area/extension/podman 🦭', description: '' }, { name: 'area/extensions/compose 🎹', description: '' }, { name: 'area/renderer 📈', description: '' }]);
  expect(offered(labels, 'The container list does not refresh')).toEqual(['area/renderer']);
  expect(offered(labels, 'podman machine fails to start, docker compose up')).toEqual(['area/extension/podman', 'area/extensions/compose', 'area/renderer']);
});

test('folder hints: paths map to their domain, prose is not a path', () => {
  const mappings = toMappings([
    { repository: '*', mappings: [], globalMappings: [{ pattern: 'tests/**', domain: 'QE' }] },
    { repository: 'https://github.com/podman-desktop/podman-desktop', mappings: [{ pattern: 'website/docs/**', domain: 'Docs' }, { pattern: 'website/**', domain: 'Foundations' }, { pattern: 'extensions/kind/**', domain: 'Kubernetes' }], globalMappings: [] },
  ]);
  const hints = folderHints({ title: 'x', body: 'see extensions/kind/src/a.ts and website/docs/intro.md, ask website/GitHub' }, mappings);
  expect(hints).toContain('- extensions/kind/src/a.ts -> domain/kubernetes');
  expect(hints).toContain('- website/docs/intro.md -> domain/documentation');
  expect(hints).not.toContain('website/GitHub ->');
  expect(hints).toContain('- domain/qe: tests');
});

test('raw gh issue: candidate label keys only, body cleaned', () => {
  const i = toIssue({ number: 1, title: 't', createdAt: '', body: '<!-- template -->\n- [x] done\nreal text', labels: [{ name: 'domain/containers' }, { name: 'domain/containers/inreview' }, { name: 'area/renderer 📈' }, { name: 'bug' }] });
  expect(i.labels).toEqual(['area/renderer', 'domain/containers']);
  expect(i.body).toBe('real text');
});

test('examples: triaged issues, older ones only when in the same repository', () => {
  const raw = [5, 50, 500].map(n => ({ number: n, title: '', body: '', createdAt: '', labels: [{ name: n === 500 ? 'area/renderer' : 'domain/qe' }] }));
  const issue = toIssue({ number: 10, title: '', body: '', createdAt: '', labels: [] });
  expect(examples(raw, issue, true).map(i => i.number)).toEqual([5]);
  expect(examples(raw, issue, false).map(i => i.number)).toEqual([5, 50]);
});
