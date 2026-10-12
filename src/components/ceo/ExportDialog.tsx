"use client";

import { useEffect, useRef, useState } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";

export function ExportDialog({
  open,
  branches,
  onClose,
  onConfirm,
}: {
  open: boolean;
  branches: { id: string; name: string }[];
  onClose: () => void;
  onConfirm: (filters: { from: string; to: string; branchId: string }) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  if (!open) return null;

  const rangeInvalid = !!from && !!to && from > to;

  function handleConfirm() {
    if (rangeInvalid) return;
    onConfirm({ from, to, branchId });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Export report"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-full max-w-sm rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-0 text-[var(--foreground)] shadow-[0_24px_70px_rgb(33_25_20/0.18)] backdrop:bg-black/45"
    >
      <div className="p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-[0.1em] text-zinc-900 dark:text-zinc-100">Export report</h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--muted)]">Optionally narrow by submitted date or branch, then confirm to download.</p>

        <div className="space-y-3">
          <FormField label="Submitted from">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Submitted to">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Branch">
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {rangeInvalid && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Start date must be before end date.</p>}

        <div className="mt-5 flex gap-2">
          <Button onClick={handleConfirm} disabled={rangeInvalid}>
            <Download className="h-4 w-4" /> Confirm &amp; download
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  );
}
