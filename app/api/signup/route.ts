import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseSignup } from "@/lib/signup";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const parsed = parseSignup(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { email, password, birthDate, gender } = parsed.data;
  const taken = NextResponse.json({ error: "Email already registered" }, { status: 409 });
  const exists = await db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirst();
  if (exists) return taken;
  try {
    await db.insertInto("users").values({ email, password_hash: await bcrypt.hash(password, 10), birth_date: birthDate, gender }).execute();
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return taken;
    throw e;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
