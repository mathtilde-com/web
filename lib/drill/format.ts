import type { Operator, Question } from "./types";

const SYMBOLS: Record<Operator, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export const symbol = (op: Operator) => SYMBOLS[op];
export const formatQuestion = (q: Pick<Question, "num1" | "num2" | "operator">) => `${q.num1} ${symbol(q.operator)} ${q.num2}`;
export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
