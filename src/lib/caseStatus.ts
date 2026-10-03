import type { Enums } from "@/lib/supabase/database.types";

type CaseStatus = Enums<"case_status">;

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  draft: "Draft",
  pending_evaluation: "Pending Evaluation",
  pending_customer_decision: "Awaiting Customer Decision",
  purchase_completion_pending: "Purchase Completion Pending",
  closed: "Closed",
  cancelled: "Cancelled",
  withdrawn: "Withdrawn",
  rejected_not_listed: "Rejected – Not Listed",
  listed_for_brokers: "Listed for Brokers",
  broker_offer_selected: "Broker Offer Selected",
  no_broker_interest: "No Broker Interest",
  broker_deal_closed: "Broker Deal Closed",
};

const TERMINAL_STATUSES: CaseStatus[] = [
  "closed",
  "cancelled",
  "withdrawn",
  "rejected_not_listed",
  "no_broker_interest",
  "broker_deal_closed",
];

export function isTerminalStatus(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function caseStatusBadgeClass(status: CaseStatus): string {
  if (status === "draft") {
    return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
  if (isTerminalStatus(status)) {
    return status === "closed" || status === "broker_deal_closed"
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  }
  return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
}
