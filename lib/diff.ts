// Client-safe (no Node imports).
/** Word level diff (LCS). Small inputs only, which is all we need for marketing copy. */
export type DiffOp = { op: 'same' | 'add' | 'del'; text: string };
export function diffWords(a: string, b: string): DiffOp[] {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  const n = A.length,
    m = B.length;
  if (n * m > 4_000_000) return [{ op: 'del', text: a }, { op: 'add', text: b }];
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp['op'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += text;
    else ops.push({ op, text });
  };
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push('same', A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A[i++]);
    else push('add', B[j++]);
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('add', B[j++]);
  return ops;
}

