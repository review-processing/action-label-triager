export type Row = { expected: string[]; predicted: string[] };
export type PRF = { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number };

const prf = (tp: number, fp: number, fn: number): PRF => {
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
};

// micro P/R/F1 over the labels starting with `prefix`, and per label
export function score(rows: Row[], prefix = ''): { micro: PRF; exact: number; perLabel: Record<string, PRF> } {
  const counts: Record<string, [number, number, number]> = {};
  let exact = 0;
  for (const { expected, predicted } of rows) {
    const e = new Set(expected.filter(l => l.startsWith(prefix))), p = new Set(predicted.filter(l => l.startsWith(prefix)));
    if (e.size === p.size && [...e].every(l => p.has(l))) exact++;
    for (const l of new Set([...e, ...p])) {
      const c = (counts[l] ??= [0, 0, 0]);
      if (e.has(l) && p.has(l)) c[0]++; else if (p.has(l)) c[1]++; else c[2]++;
    }
  }
  const sum = Object.values(counts).reduce((s, c) => s.map((x, i) => x + c[i]), [0, 0, 0]);
  return {
    micro: prf(sum[0], sum[1], sum[2]),
    exact: rows.length ? exact / rows.length : 0,
    perLabel: Object.fromEntries(Object.entries(counts).map(([l, c]) => [l, prf(...c)])),
  };
}
