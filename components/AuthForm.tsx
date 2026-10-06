"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

const GENDER_OPTIONS = [
  ["", "Prefer not to say"],
  ["male", "Male"],
  ["female", "Female"],
  ["non-binary", "Non-binary"],
  ["other", "Other"],
] as const;

const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    try {
      if (mode === "signup") {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, birthDate: f.get("birthDate"), gender: f.get("gender") }),
        });
        if (!res.ok) {
          setError((await res.json().catch(() => null))?.error ?? "Something went wrong");
          return;
        }
      }
      const r = await signIn("credentials", { email, password, redirect: false });
      if (r?.error) setError("Invalid email or password");
      else window.location.assign("/drill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">Email
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Password
        <input name="password" type="password" required autoComplete={mode === "signup" ? "new-password" : "current-password"} className={input} />
      </label>
      {mode === "signup" && (
        <>
          <label className="flex flex-col gap-1 text-sm">Birth date (optional)
            <input name="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">Gender (optional)
            <select name="gender" className={input} defaultValue="">
              {GENDER_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <p className="text-xs text-neutral-500">Birth date and gender are only used to compare your times with similar people.</p>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
        {mode === "signup" ? "Sign up" : "Log in"}
      </button>
    </form>
  );
}
