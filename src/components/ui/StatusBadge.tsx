import { CASE_STATUS_LABELS, caseStatusBadgeClass } from "@/lib/caseStatus";
import type { Enums } from "@/lib/supabase/database.types";

export function StatusBadge({ status }: { status: Enums<"case_status"> }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${caseStatusBadgeClass(status)}`}>
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}
