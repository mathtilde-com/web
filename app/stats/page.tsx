import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import HistoryChart from "@/components/HistoryChart";
import { formatSeconds, symbol } from "@/lib/drill/format";
import { OPERATORS } from "@/lib/drill/types";
import { getBenchmark, getHistory, getPerOperator, MIN_COHORT, type Benchmark } from "@/lib/stats";

function benchmarkText(b: Benchmark): string {
  switch (b.status) {
    case "ok": return `Your best time is faster than ${b.percentile.toFixed(0)}% of ${b.cohortSize} people aged ${b.bandLabel}.`;
    case "insufficient": return `Not enough data yet (${b.cohortSize}/${MIN_COHORT} people in your group).`;
    case "no-profile": return "Benchmarks are available for accounts created with a birth date and gender.";
    case "no-drills": return "Complete a drill to see how you compare.";
  }
}

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const uid = session.user.id;
  const [history, perOp, benchmark] = await Promise.all([getHistory(uid), getPerOperator(uid), getBenchmark(uid)]);
  const best = history.length ? Math.min(...history.map((h) => h.totalDurationMs)) : null;
  const latest = history.at(-1);
  const fmt = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Your stats</h1>
        <Link href="/drill" className="text-indigo-600 underline">New drill</Link>
      </header>
      <section className="grid grid-cols-2 gap-4 tabular-nums">
        <div><p className="text-sm text-neutral-500">Best</p><p className="text-3xl font-semibold">{best != null ? formatSeconds(best) : "–"}</p></div>
        <div><p className="text-sm text-neutral-500">Latest</p><p className="text-3xl font-semibold">{latest ? formatSeconds(latest.totalDurationMs) : "–"}</p></div>
      </section>
      <section>
        <h2 className="mb-2 font-medium">History</h2>
        <HistoryChart data={history.map((h) => ({ label: fmt(h.completedAt), seconds: h.totalDurationMs / 1000 }))} />
      </section>
      <section>
        <h2 className="mb-2 font-medium">Average per operator</h2>
        <ul className="grid grid-cols-4 gap-2 text-center tabular-nums">
          {OPERATORS.map((op) => (
            <li key={op} className="rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
              <div className="text-xl">{symbol(op)}</div>
              <div className="text-sm">{perOp[op] != null ? formatSeconds(perOp[op]!) : "–"}</div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 font-medium">Benchmark</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{benchmarkText(benchmark)}</p>
      </section>
      <section>
        <h2 className="mb-2 font-medium">Recent drills</h2>
        <ul className="text-sm tabular-nums">
          {[...history].reverse().slice(0, 10).map((h) => (
            <li key={h.id} className="border-t border-neutral-200 py-1 dark:border-neutral-800">
              <Link href={`/results/${h.id}`} className="flex justify-between hover:underline">
                <span>{fmt(h.completedAt)}</span><span>{formatSeconds(h.totalDurationMs)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
