"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Numpad from "@/components/Numpad";
import Summary from "@/components/Summary";
import { generateDrill } from "@/lib/drill/generate";
import { formatQuestion } from "@/lib/drill/format";
import { initState, sanitizeInput, shouldAutoSubmit, startDrill, submitAnswer, type DrillState } from "@/lib/drill/machine";
import { DRILL_SIZE, type QuestionLog } from "@/lib/drill/types";

type SaveStatus = "idle" | "saving" | "error";

async function postDrill(logs: QuestionLog[]): Promise<string | null | "failed"> {
  const res = await fetch("/api/drills", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      questions: logs.map((l) => ({ index: l.index, num1: l.num1, num2: l.num2, operator: l.operator, expectedAnswer: l.expected, attempts: l.attempts, durationMs: l.durationMs })),
    }),
  });
  if (res.status === 201) return (await res.json()).id as string;
  if (res.status === 204) return null;
  return "failed";
}

export default function Drill({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<DrillState | null>(null);
  const [typed, setTyped] = useState("");
  const [flash, setFlash] = useState(false);
  const [save, setSave] = useState<SaveStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  function start() {
    setState(startDrill(initState(generateDrill(Math.random)), performance.now()));
    setTyped("");
    setSave("idle");
    queueMicrotask(() => inputRef.current?.focus());
  }

  async function persist(logs: QuestionLog[]) {
    if (!signedIn) return;
    setSave("saving");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await postDrill(logs);
        if (typeof r === "string" && r !== "failed") { router.replace(`/results/${r}`); return; }
        if (r === null) { setSave("idle"); return; }
      } catch { /* retry once */ }
      await new Promise((res) => setTimeout(res, 1000));
    }
    setSave("error");
  }

  function onInput(raw: string) {
    if (!state || state.phase !== "running") return;
    const v = sanitizeInput(raw);
    const expected = state.questions[state.index].expected;
    if (!shouldAutoSubmit(v, expected)) { setTyped(v); return; }
    const r = submitAnswer(state, v, performance.now());
    setState(r.state);
    setTyped("");
    if (r.correct === false) { setFlash(true); setTimeout(() => setFlash(false), 300); }
    if (r.correct && r.state.phase === "done") void persist(r.state.logs);
  }

  if (!state) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="max-w-sm text-neutral-600 dark:text-neutral-400">
          60 questions. The first is a warm-up and isn&apos;t timed. Type the answer — it submits itself.
        </p>
        <button onClick={start} className="rounded-md bg-indigo-600 px-8 py-3 text-lg font-medium text-white hover:bg-indigo-500">Start</button>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div className="flex flex-col gap-6">
        <Summary logs={state.logs} />
        {save === "saving" && <p className="text-sm text-neutral-500">Saving…</p>}
        {save === "error" && (
          <p role="alert" className="text-sm text-red-600">
            Couldn&apos;t save. <button className="underline" onClick={() => void persist(state.logs)}>Retry</button>
          </p>
        )}
        {!signedIn && <p className="text-sm"><Link href="/signup" className="text-indigo-600 underline">Sign up to save your results</Link> and track progress.</p>}
        <button onClick={() => setState(null)} className="self-start rounded-md border border-neutral-300 px-4 py-2 dark:border-neutral-700">Play again</button>
      </div>
    );
  }

  const q = state.questions[state.index];
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-neutral-500">Question {state.index + 1} / {DRILL_SIZE}{state.index === 0 ? " · warm-up (untimed)" : ""}</p>
      <progress className="w-full max-w-xs" max={DRILL_SIZE} value={state.index} />
      <p data-testid="question" className="text-6xl font-semibold tabular-nums">{formatQuestion(q)}</p>
      <input
        ref={inputRef}
        data-testid="answer"
        value={typed}
        onChange={(e) => onInput(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        aria-label="Your answer"
        className={`w-40 rounded-md border-2 px-3 py-2 text-center text-3xl tabular-nums focus:outline-none dark:bg-neutral-900 ${flash ? "border-red-500" : "border-neutral-300 focus:border-indigo-500 dark:border-neutral-700"}`}
      />
      <Numpad onDigit={(d) => { onInput(typed + d); inputRef.current?.focus(); }} onBackspace={() => setTyped((t) => t.slice(0, -1))} />
    </div>
  );
}
