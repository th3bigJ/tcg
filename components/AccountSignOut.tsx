"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AccountSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void signOut()}
      className="mt-8 inline-flex rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
