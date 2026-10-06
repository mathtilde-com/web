import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();
  const link = "text-indigo-600 hover:underline";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">MathTilde</h1>
      <p className="text-neutral-600 dark:text-neutral-400">60 questions. Be fast. Be right.</p>
      <Link href="/drill" className="rounded-md bg-indigo-600 px-8 py-3 text-lg font-medium text-white hover:bg-indigo-500">Start drill</Link>
      <nav className="flex gap-4 text-sm">
        {session?.user?.id ? (
          <>
            <Link href="/stats" className={link}>Stats</Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <button className={link}>Log out</button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className={link}>Log in</Link>
            <Link href="/signup" className={link}>Sign up</Link>
          </>
        )}
      </nav>
    </main>
  );
}
