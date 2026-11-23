import { expect, test } from 'bun:test';
import { score } from './score';

test('micro precision, recall, exact match, per prefix', () => {
  const rows = [
    { expected: ['domain/a', 'area/x'], predicted: ['domain/a', 'area/y'] }, // domain exact, area wrong
    { expected: ['domain/b'], predicted: ['domain/a', 'domain/b'] },         // domain fp
    { expected: [], predicted: [] },
  ];
  const all = score(rows);
  expect([all.micro.tp, all.micro.fp, all.micro.fn]).toEqual([2, 2, 1]);
  expect(all.micro.precision).toBe(0.5);
  expect(all.exact).toBeCloseTo(1 / 3);
  const d = score(rows, 'domain/');
  expect(d.exact).toBeCloseTo(2 / 3);
  expect(d.perLabel['domain/a']).toMatchObject({ tp: 1, fp: 1, fn: 0 });
  expect(score(rows, 'area/').micro.recall).toBe(0);
});
