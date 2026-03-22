"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
      const origin = window.location.origin;
      const { error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/`,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
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
      <h1 className="text-xl font-semibold">Create account</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">
        Registration uses Supabase Auth. If email confirmation is enabled in Supabase, check your inbox
        before signing in.
      </p>
      <form onSubmit={onSubmit} className="mt-8 flex max-w-sm flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">First name</span>
          <input
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(ev) => setFirstName(ev.target.value)}
            className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Last name</span>
          <input
            type="text"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(ev) => setLastName(ev.target.value)}
            className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/40"
          />
        </label>
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
            autoComplete="new-password"
            required
            minLength={8}
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
          {pending ? "Creating…" : "Register"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--foreground)]/65">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
