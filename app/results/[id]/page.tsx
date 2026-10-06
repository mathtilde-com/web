import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import Summary from "@/components/Summary";
import { db } from "@/lib/db";
import type { QuestionLog } from "@/lib/drill/types";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const drill = await db.selectFrom("sessions_drill").select("id")
    .where("id", "=", id).where("user_id", "=", session.user.id).executeTakeFirst();
  if (!drill) notFound();
  const rows = await db.selectFrom("question_logs").selectAll().where("session_id", "=", id).orderBy("question_index").execute();
  const logs: QuestionLog[] = rows.map((r) => ({
    index: r.question_index, num1: r.num1, num2: r.num2, operator: r.operator,
    expected: r.expected_answer, attempts: r.attempts_count, durationMs: r.duration_ms,
  }));
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8">
      <Summary logs={logs} />
      <div className="flex gap-4 text-sm">
        <Link href="/drill" className="text-indigo-600 underline">Play again</Link>
        <Link href="/stats" className="text-indigo-600 underline">Stats</Link>
      </div>
    </main>
  );
}
