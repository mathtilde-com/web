import { z } from "zod";
import { isValidQuestion } from "./generate";
import { DRILL_SIZE, MAX_QUESTION_MS, type QuestionLog } from "./types";

const schema = z.object({
  clientId: z.uuid(),
  questions: z.array(z.object({
    index: z.number().int(),
    num1: z.number().int(),
    num2: z.number().int(),
    operator: z.enum(["+", "-", "*", "/"]),
    expectedAnswer: z.number().int(),
    attempts: z.number().int().min(1).max(1000),
    durationMs: z.number().int().min(0).max(MAX_QUESTION_MS),
  })).length(DRILL_SIZE),
});

export function validateDrillPayload(input: unknown):
  | { ok: true; clientId: string; logs: QuestionLog[]; totalDurationMs: number }
  | { ok: false } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const logs: QuestionLog[] = [];
  for (const [i, q] of parsed.data.questions.entries()) {
    if (q.index !== i + 1) return { ok: false };
    const log: QuestionLog = { index: q.index, num1: q.num1, num2: q.num2, operator: q.operator, expected: q.expectedAnswer, attempts: q.attempts, durationMs: q.durationMs };
    if (!isValidQuestion(log)) return { ok: false };
    logs.push(log);
  }
  const totalDurationMs = logs.filter((l) => l.index >= 2).reduce((s, l) => s + l.durationMs, 0);
  return { ok: true, clientId: parsed.data.clientId, logs, totalDurationMs };
}
