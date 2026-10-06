"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function HistoryChart({ data }: { data: { label: string; seconds: number }[] }) {
  if (!data.length) return <p className="text-sm text-neutral-500">Complete a drill to see your history.</p>;
  return (
    <div role="img" aria-label="Total drill time in seconds over your recent drills" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis unit="s" tick={{ fontSize: 12 }} width={48} domain={["auto", "auto"]} />
          <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}s`, "Total time"]} />
          <Line type="monotone" dataKey="seconds" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
