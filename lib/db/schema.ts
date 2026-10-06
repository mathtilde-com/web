import type { ColumnType, Generated } from "kysely";

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  birth_date: string | null;
  gender: "male" | "female" | "non-binary" | "other" | "prefer_not_to_say" | null;
  created_at: ColumnType<Date, never, never>;
}
export interface SessionsDrillTable {
  id: Generated<string>;
  user_id: string;
  total_duration_ms: number;
  rules_version: Generated<number>;
  completed_at: ColumnType<Date, never, never>;
}
export interface QuestionLogsTable {
  id: Generated<string>;
  session_id: string;
  question_index: number;
  num1: number;
  num2: number;
  operator: "+" | "-" | "*" | "/";
  expected_answer: number;
  attempts_count: number;
  duration_ms: number;
  created_at: ColumnType<Date, never, never>;
}
export interface Database {
  users: UsersTable;
  sessions_drill: SessionsDrillTable;
  question_logs: QuestionLogsTable;
}
