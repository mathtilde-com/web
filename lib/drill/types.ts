export type Operator = "+" | "-" | "*" | "/";
export type Rng = () => number;
export interface Question { num1: number; num2: number; operator: Operator; expected: number }
export interface QuestionLog extends Question { index: number; attempts: number; durationMs: number }
export const OPERATORS: Operator[] = ["+", "-", "*", "/"];
export const DRILL_SIZE = 60;
export const MAX_QUESTION_MS = 600000;
