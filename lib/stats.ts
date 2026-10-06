import { sql } from "kysely";
import { db } from "@/lib/db";
import type { Operator } from "@/lib/drill/types";

export const MIN_COHORT = 20;

export function ageBand(birthDate: string, at: Date): number {
  const b = new Date(birthDate + "T00:00:00Z");
  let age = at.getUTCFullYear() - b.getUTCFullYear();
  const m = at.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) age--;
  return Math.floor(age / 5);
}

export function percentileRank(cohortBest: number[], mine: number): number {
  if (!cohortBest.length) return 0;
  return (cohortBest.filter((t) => t > mine).length / cohortBest.length) * 100;
}

export async function getHistory(userId: string) {
  const rows = await db.selectFrom("sessions_drill").select(["id", "completed_at", "total_duration_ms"])
    .where("user_id", "=", userId).orderBy("completed_at", "desc").limit(100).execute();
  return rows.reverse().map((r) => ({ id: r.id, completedAt: new Date(r.completed_at), totalDurationMs: r.total_duration_ms }));
}

export async function getPerOperator(userId: string) {
  const rows = await db.selectFrom("question_logs")
    .innerJoin("sessions_drill", "sessions_drill.id", "question_logs.session_id")
    .select(["question_logs.operator as operator", sql<number>`avg(question_logs.duration_ms)::float`.as("avg_ms")])
    .where("sessions_drill.user_id", "=", userId).where("question_logs.question_index", ">=", 2)
    .groupBy("question_logs.operator").execute();
  const out: Partial<Record<Operator, number>> = {};
  for (const r of rows) out[r.operator] = Number(r.avg_ms);
  return out;
}

export type Benchmark =
  | { status: "ok"; percentile: number; cohortSize: number; bandLabel: string }
  | { status: "no-profile" }
  | { status: "no-drills" }
  | { status: "insufficient"; cohortSize: number };

export async function getBenchmark(userId: string): Promise<Benchmark> {
  const me = await db.selectFrom("users").select([sql<string | null>`birth_date::text`.as("birth_date"), "gender"]).where("id", "=", userId).executeTakeFirst();
  if (!me?.birth_date || !me.gender || me.gender === "prefer_not_to_say") return { status: "no-profile" };
  const mine = await db.selectFrom("sessions_drill").select(sql<number>`min(total_duration_ms)`.as("best")).where("user_id", "=", userId).executeTakeFirst();
  if (mine?.best == null) return { status: "no-drills" };
  const myBand = ageBand(me.birth_date, new Date());
  // Each user's best time among drills done in the same gender and the same age band (age at drill time).
  const { rows } = await sql<{ user_id: string; best: number }>`
    SELECT s.user_id, MIN(s.total_duration_ms)::int AS best
    FROM sessions_drill s JOIN users u ON u.id = s.user_id
    WHERE u.gender = ${me.gender} AND u.birth_date IS NOT NULL
      AND FLOOR(DATE_PART('year', AGE(s.completed_at, u.birth_date)) / 5) = ${myBand}
      AND s.rules_version = 1
    GROUP BY s.user_id`.execute(db);
  if (rows.length < MIN_COHORT) return { status: "insufficient", cohortSize: rows.length };
  return { status: "ok", percentile: percentileRank(rows.map((r) => r.best), Number(mine.best)), cohortSize: rows.length, bandLabel: `${myBand * 5}–${myBand * 5 + 4}` };
}
