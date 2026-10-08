"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { BrokerAction } from "@/lib/broker";

type ActionName = "broker_case_action" | "manage_broker";

export function useBrokerAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run<N extends ActionName>(
    name: N,
    args: Database["public"]["Functions"][N]["Args"],
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await createClient().rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      const response = result.data as unknown as { error?: string } | null;
      if (response?.error) throw new Error(response.error);
      setSuccess("Saved.");
      router.refresh();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please try again.",
      );
      router.refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const act = (caseId: string, action: BrokerAction, payload: Json = {}) =>
    run("broker_case_action", {
      p_case_id: caseId,
      p_action: action,
      p_payload: payload,
    });
  return { busy, error, success, run, act };
}

export function ActionFeedback({
  error,
  success,
}: {
  error: string;
  success: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="my-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="my-2 text-sm text-green-700 dark:text-green-400"
        >
          {success}
        </p>
      )}
    </>
  );
}
