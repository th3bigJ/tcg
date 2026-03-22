"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">
        Uses Supabase Auth. Your profile in Payload is created automatically on first sign-in.
      </p>
      <form onSubmit={onSubmit} className="mt-8 flex max-w-sm flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/40"
          />
        </label>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--foreground)]/65">
        No account?{" "}
        <Link href="/register" className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
