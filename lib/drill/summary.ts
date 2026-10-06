import type { Operator, QuestionLog } from "./types";

export function summarize(logs: QuestionLog[]) {
  const timed = logs.filter((l) => l.index >= 2);
  const totalDurationMs = timed.reduce((s, l) => s + l.durationMs, 0);
  const retries = logs.filter((l) => l.attempts > 1).length;
  const accuracyPct = logs.length ? ((logs.length - retries) / logs.length) * 100 : 0;
  const slowest = [...timed].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  const sums: Partial<Record<Operator, { t: number; n: number }>> = {};
  for (const l of timed) {
    const e = (sums[l.operator] ??= { t: 0, n: 0 });
    e.t += l.durationMs; e.n++;
  }
  const perOperatorAvgMs: Partial<Record<Operator, number>> = {};
  for (const [op, e] of Object.entries(sums)) perOperatorAvgMs[op as Operator] = e!.t / e!.n;
  return { totalDurationMs, retries, accuracyPct, slowest, perOperatorAvgMs };
}
