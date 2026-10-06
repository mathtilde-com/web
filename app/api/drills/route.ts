import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { validateDrillPayload } from "@/lib/drill/payload";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse(null, { status: 204 });
  if (!rateLimit(`drill:${userId}`, 30, 60 * 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const v = validateDrillPayload(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: "Invalid drill" }, { status: 400 });
  const id = await db.transaction().execute(async (trx) => {
    const s = await trx.insertInto("sessions_drill")
      .values({ user_id: userId, total_duration_ms: v.totalDurationMs, client_id: v.clientId })
      .onConflict((oc) => oc.columns(["user_id", "client_id"]).doNothing())
      .returning("id").executeTakeFirst();
    if (!s) {
      // Same drill already saved (a retry after a lost response): return it, insert nothing.
      const existing = await trx.selectFrom("sessions_drill").select("id")
        .where("user_id", "=", userId).where("client_id", "=", v.clientId).executeTakeFirstOrThrow();
      return existing.id;
    }
    await trx.insertInto("question_logs").values(v.logs.map((l) => ({
      session_id: s.id, question_index: l.index, num1: l.num1, num2: l.num2,
      operator: l.operator, expected_answer: l.expected, attempts_count: l.attempts, duration_ms: l.durationMs,
    }))).execute();
    return s.id;
  });
  return NextResponse.json({ id }, { status: 201 });
}
