import { createClient } from "@/lib/supabase/server";
import type { StaffBrokerCase } from "@/lib/broker";
import { StaffBrokerControls } from "./StaffBrokerControls";

export async function StaffBrokerPanel({
  caseId,
  status,
  readOnly = false,
}: {
  caseId: string;
  status: string;
  readOnly?: boolean;
}) {
  if (
    ![
      "pending_customer_decision",
      "listed_for_brokers",
      "broker_offer_selected",
      "broker_deal_closed",
      "withdrawn",
    ].includes(status)
  )
    return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_broker_case", {
    p_case_id: caseId,
  });
  if (error)
    return (
      <p role="alert" className="mt-6 text-sm text-red-600">
        Could not load broker activity: {error.message}
      </p>
    );
  const brokerCase = data as unknown as StaffBrokerCase;
  const activeId = brokerCase.reservations.find(r => r.status === "active" && Date.parse(r.expires_at) > Date.parse(brokerCase.server_now))?.id;
  return (
    <StaffBrokerControls
      key={`${caseId}-${activeId ?? "open"}`}
      caseId={caseId}
      status={status}
      data={brokerCase}
      readOnly={readOnly}
    />
  );
}
