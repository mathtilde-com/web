import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isRateLimited, recordHit } from "@/lib/rateLimit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds, request) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        // Keyed by IP so a third party can't lock out a known address; only failures count.
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
        const perEmail = `login:${ip}:${email}`, perIp = `login-ip:${ip}`;
        if (isRateLimited(perEmail, 10, 15 * 60_000) || isRateLimited(perIp, 50, 15 * 60_000)) return null;
        const user = await db.selectFrom("users").select(["id", "email", "password_hash"]).where("email", "=", email).executeTakeFirst();
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
          recordHit(perEmail); recordHit(perIp);
          return null;
        }
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) { if (user?.id) token.uid = user.id; return token; },
    session({ session, token }) { if (token.uid) session.user.id = token.uid as string; return session; },
  },
});
