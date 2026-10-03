"use client";

import { useState } from "react";
import { Check, Pause, Play, X } from "lucide-react";
import type { Tables } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/FormField";
import { ActionFeedback, useBrokerAction } from "./useBrokerAction";

export function BrokerAdmin({ broker }: { broker: Tables<"brokers"> }) {
  const { run, error, success, busy } = useBrokerAction();
  const [reason, setReason] = useState("");
  const actions = broker.suspended_at
    ? ["reactivate"]
    : broker.status === "approved"
      ? ["suspend"]
      : broker.status === "pending"
        ? ["approve", "reject"]
        : ["approve"];
  const icons = { approve: Check, reject: X, suspend: Pause, reactivate: Play };
  return (
    <article className="space-y-3 border-b border-zinc-200 py-5 dark:border-zinc-800">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="font-semibold">{broker.company_name}</h2>
          <p className="text-xs text-zinc-500">{broker.broker_ref}</p>
        </div>
        <span className="text-sm capitalize">
          {broker.suspended_at ? "suspended" : broker.status}
        </span>
      </div>
      <p className="break-words text-sm">
        {broker.contact_name} / {broker.email} / {broker.phone}
      </p>
      {broker.status_reason && (
        <p className="text-sm text-zinc-500">
          Last decision: {broker.status_reason}
        </p>
      )}
      <label className="block text-sm">
        Decision reason
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          className={`mt-1 ${inputClass}`}
          rows={2}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = icons[action as keyof typeof icons];
          return (
            <Button
              key={action}
              disabled={busy || !reason.trim()}
              variant={
                action === "reject" || action === "suspend"
                  ? "destructive"
                  : "primary"
              }
              onClick={() =>
                run("manage_broker", {
                  p_broker_id: broker.id,
                  p_action: action,
                  p_reason: reason,
                })
              }
            >
              <Icon size={16} />
              <span className="capitalize">{action}</span>
            </Button>
          );
        })}
      </div>
      <ActionFeedback error={error} success={success} />
    </article>
  );
}
