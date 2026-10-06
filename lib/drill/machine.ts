import { MAX_QUESTION_MS, type Question, type QuestionLog } from "./types";

export type DrillState = {
  phase: "ready" | "running" | "done";
  questions: Question[];
  index: number;
  attempts: number;
  startedAt: number;
  logs: QuestionLog[];
};

export const sanitizeInput = (raw: string) => raw.replace(/\D/g, "").slice(0, 5);
export const shouldAutoSubmit = (typed: string, expected: number) =>
  typed.length > 0 && typed.length === String(expected).length;

export const initState = (questions: Question[]): DrillState =>
  ({ phase: "ready", questions, index: 0, attempts: 1, startedAt: 0, logs: [] });

export const startDrill = (s: DrillState, now: number): DrillState =>
  s.phase === "ready" ? { ...s, phase: "running", startedAt: now } : s;

export function submitAnswer(s: DrillState, typed: string, now: number): { state: DrillState; correct: boolean | null } {
  if (s.phase !== "running" || typed === "" || !/^\d+$/.test(typed)) return { state: s, correct: null };
  const q = s.questions[s.index];
  if (Number(typed) !== q.expected) return { state: { ...s, attempts: s.attempts + 1 }, correct: false };
  const durationMs = Math.min(MAX_QUESTION_MS, Math.max(0, Math.round(now - s.startedAt)));
  const logs = [...s.logs, { ...q, index: s.index + 1, attempts: s.attempts, durationMs }];
  const done = s.index + 1 >= s.questions.length;
  return {
    state: { ...s, logs, index: s.index + 1, attempts: 1, startedAt: now, phase: done ? "done" : "running" },
    correct: true,
  };
}
