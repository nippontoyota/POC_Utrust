"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import type { PtlBranchPo } from "@/lib/ptl";

export function AssignPoForm({
  caseId,
  pos,
  currentPoId,
}: {
  caseId: string;
  pos: PtlBranchPo[];
  currentPoId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [poId, setPoId] = useState(currentPoId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReassign = currentPoId !== null;

  async function handleAssign() {
    if (!poId) {
      setError("Choose a Purchase Officer first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("ptl_assign_po", { p_case_id: caseId, p_po_id: poId });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    fetch("/api/notifications/notify-po", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId }),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {pos.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No active Purchase Officers in this branch.</p>
      ) : (
        <>
          <div className="space-y-2">
            {pos.map((po) => (
              <label
                key={po.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition ${
                  poId === po.id ? "border-[var(--brand)] bg-red-50/60 dark:bg-red-950/20" : "border-[var(--line)]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="po"
                    value={po.id}
                    checked={poId === po.id}
                    onChange={() => setPoId(po.id)}
                    className="accent-[var(--brand)]"
                  />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {po.full_name} ({po.employee_id})
                    {po.id === currentPoId && " — currently assigned"}
                  </span>
                </span>
                <span className={`font-bold ${po.open_case_count === 0 ? "text-green-600 dark:text-green-400" : "text-[var(--muted)]"}`}>
                  {po.open_case_count === 0 ? "Free" : `${po.open_case_count} open`}
                </span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="button" onClick={handleAssign} disabled={submitting || !poId || poId === currentPoId}>
            {submitting ? "Assigning…" : isReassign ? "Reassign Case" : "Assign Case"}
          </Button>
        </>
      )}
    </div>
  );
}
