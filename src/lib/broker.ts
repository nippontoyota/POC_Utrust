import type { Json } from "@/lib/supabase/database.types";

export type BrokerAction =
  | "offer"
  | "withdraw_offer"
  | "select"
  | "accept"
  | "reject"
  | "release"
  | "complete"
  | "withdraw_consent";
export type BrokerPhoto = {
  id: string;
  category: string;
  file_size_bytes: number;
  broker_visible?: boolean;
  is_plate_visible?: boolean;
};
export type BrokerOffer = {
  id: string;
  amount: number;
  note: string;
  revision: number;
  status: string;
  submitted_at: string;
  broker_id?: string;
  broker_name?: string;
  broker_ref?: string;
  approved?: boolean;
  broker_contact?: string;
  broker_phone?: string;
  broker_email?: string;
};
export type Reservation = {
  id: string;
  amount: number;
  status: string;
  started_at: string;
  expires_at: string;
  customer_decision: string | null;
  ended_at: string | null;
  broker_name?: string;
  end_reason?: string;
  selection_reason?: string;
  payment_complete?: boolean;
  handover_complete?: boolean;
};
export type BrokerEvent = {
  id: string;
  event_type: string;
  created_at: string;
  amount?: number;
  notes?: string;
  metadata?: Json;
};
export type MarketplaceVehicle = {
  id: string;
  case_ref: string;
  branch_name: string;
  make: string;
  model: string;
  variant: string;
  registration_year: number;
  odometer_km: number;
  fuel_type: string;
  transmission: string;
  availability: "open" | "reserved" | "unavailable";
  expires_at: string | null;
  own_offer: BrokerOffer | null;
  photos: BrokerPhoto[];
  reservations: Reservation[];
  history: BrokerEvent[];
};
export type MarketplaceResult = {
  total: number;
  server_now: string;
  items: MarketplaceVehicle[];
};
export type StaffBrokerCase = {
  server_now: string;
  offers: BrokerOffer[];
  reservations: Reservation[];
  photos: BrokerPhoto[];
  events: BrokerEvent[];
};

export type MarketplaceFunctions = {
  broker_case_action: {
    Args: { p_case_id: string; p_action: BrokerAction; p_payload?: Json };
    Returns: Json;
  };
  broker_marketplace: {
    Args: {
      p_search?: string;
      p_branch?: string;
      p_view?: string;
      p_page?: number;
      p_sort?: string;
      p_case_id?: string;
    };
    Returns: Json;
  };
  staff_broker_case: { Args: { p_case_id: string }; Returns: Json };
  review_broker_photo: {
    Args: { p_photo_id: string; p_visible: boolean };
    Returns: undefined;
  };
  manage_broker: {
    Args: { p_broker_id: string; p_action: string; p_reason: string };
    Returns: undefined;
  };
  start_po_evaluation: { Args: { p_case_id: string }; Returns: undefined };
  broker_report: {
    Args: {
      p_from?: string;
      p_to?: string;
      p_branch?: string;
      p_broker?: string;
    };
    Returns: Json;
  };
  so_broker_summary: {
    Args: Record<PropertyKey, never>;
    Returns: {
      listed: number;
      reserved: number;
      awaiting_selection: number;
      expiring: number;
    };
  };
};

export type BrokerReport = {
  listed: number;
  without_offers: number;
  active: number;
  expiring: number;
  completed: number;
  deal_value: number;
  cohort_listed: number;
  cohort_completed: number;
  brokers: {
    id: string;
    name: string;
    attempts: number;
    completed: number;
    expired: number;
    released: number;
    value: number;
  }[];
  outcomes: { reason: string; count: number }[];
  cases: {
    id: string;
    case_ref: string;
    branch_name: string;
    broker_name: string | null;
    status: string;
    expires_at: string | null;
  }[];
};
