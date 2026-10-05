"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type RpcName = "admin_set_profile_active" | "admin_reassign_profile";

export function useAdminAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function runRpc<N extends RpcName>(name: N, args: Database["public"]["Functions"][N]["Args"]) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await createClient().rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      setSuccess("Saved.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runServerAction<Args extends unknown[]>(
    action: (...args: Args) => Promise<{ error?: string }>,
    ...args: Args
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await action(...args);
      if (result.error) {
        setError(result.error);
        return false;
      }
      setSuccess("Saved.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, success, runRpc, runServerAction };
}

export function ActionFeedback({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="my-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="my-2 text-sm text-green-700 dark:text-green-400">
          {success}
        </p>
      )}
    </>
  );
}
