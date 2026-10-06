import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <AuthForm mode="login" />
      <Link href="/signup" className="text-center text-sm text-indigo-600 hover:underline">No account? Sign up</Link>
    </main>
  );
}
