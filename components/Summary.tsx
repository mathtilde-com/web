import { formatQuestion, formatSeconds, symbol } from "@/lib/drill/format";
import { summarize } from "@/lib/drill/summary";
import { OPERATORS, type QuestionLog } from "@/lib/drill/types";

export default function Summary({ logs }: { logs: QuestionLog[] }) {
  const s = summarize(logs);
  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-neutral-500">Total time (questions 2–60)</p>
        <p data-testid="total-time" className="text-5xl font-semibold tabular-nums">{formatSeconds(s.totalDurationMs)}</p>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {logs.length - s.retries} of {logs.length} right first try ({s.accuracyPct.toFixed(0)}%)
        </p>
      </div>
      <div>
        <h2 className="mb-2 font-medium">Slowest questions</h2>
        <table className="w-full text-sm tabular-nums">
          <tbody>
            {s.slowest.map((l) => (
              <tr key={l.index} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1">#{l.index}</td>
                <td>{formatQuestion(l)}</td>
                <td className="text-right">{formatSeconds(l.durationMs)}</td>
                <td className="text-right text-neutral-500">{l.attempts > 1 ? `${l.attempts} tries` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h2 className="mb-2 font-medium">Average per operator</h2>
        <ul className="grid grid-cols-4 gap-2 text-center tabular-nums">
          {OPERATORS.map((op) => (
            <li key={op} className="rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
              <div className="text-xl">{symbol(op)}</div>
              <div className="text-sm">{s.perOperatorAvgMs[op] != null ? formatSeconds(s.perOperatorAvgMs[op]!) : "–"}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
