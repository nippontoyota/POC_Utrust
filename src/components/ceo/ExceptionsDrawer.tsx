"use client";

import { useEffect, useRef } from "react";
import { X, Clock, TriangleAlert, ClipboardList } from "lucide-react";
import type { CeoOverview, CeoAttentionCase } from "@/lib/ceo";
import { vehicleLabel, shortCaseRef } from "@/lib/caseRef";

export type ExceptionsKind = "due_soon" | "expired" | "accepted_pending";

const CONFIG: Record<ExceptionsKind, { title: string; icon: typeof Clock; dateLabel: string; personLabel: string }> = {
  due_soon: { title: "Customer decisions due within 12h", icon: Clock, dateLabel: "Deadline", personLabel: "PO" },
  expired: { title: "Decision windows expired", icon: TriangleAlert, dateLabel: "Deadline was", personLabel: "PO" },
  accepted_pending: { title: "Accepted, purchase not completed", icon: ClipboardList, dateLabel: "Accepted on", personLabel: "SO" },
};

export function ExceptionsDrawer({
  kind,
  attention,
  onClose,
}: {
  kind: ExceptionsKind | null;
  attention: CeoOverview["attention"];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (kind) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [kind]);

  if (!kind) return null;

  const { title, icon: Icon, dateLabel, personLabel } = CONFIG[kind];
  const items: CeoAttentionCase[] = attention[kind];

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          onClose();
        }
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-md border-l border-[var(--line)] bg-[var(--panel)] p-0 text-[var(--foreground)] backdrop:bg-black/45"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 text-[var(--muted)]" />
            <h2 className="truncate text-sm font-black uppercase tracking-[0.1em] text-zinc-900 dark:text-zinc-100">{title}</h2>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No cases here right now.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((c) => (
                <li key={c.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {vehicleLabel(c.make, c.model)}
                    {c.vehicle_reg_number ? ` — ${c.vehicle_reg_number}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
                    <span>{c.branch_name}</span>
                    {c.case_ref && <span>{shortCaseRef(c.case_ref)}</span>}
                    {(c.po_name || c.so_name) && (
                      <span>
                        {personLabel}: {c.po_name ?? c.so_name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {dateLabel}:{" "}
                    {new Date((c.offer_deadline_at ?? c.customer_decision_at) as string).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
