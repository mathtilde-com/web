import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password || !rateLimit(`login:${email}`, 10, 15 * 60_000)) return null;
        const user = await db.selectFrom("users").select(["id", "email", "password_hash"]).where("email", "=", email).executeTakeFirst();
        if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) { if (user?.id) token.uid = user.id; return token; },
    session({ session, token }) { if (token.uid) session.user.id = token.uid as string; return session; },
  },
});
