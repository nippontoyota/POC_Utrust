export type CeoKpis = {
  completed_deals: number;
  completed_nippon: number;
  completed_broker: number;
  nippon_purchase_value: number;
  nippon_purchase_count: number;
  broker_deal_value: number;
  broker_deal_count: number;
  open_cases: number;
  due_soon_count: number;
  expired_count: number;
};

export type CeoPipeline = {
  pending_assignment: number;
  pending_evaluation: number;
  awaiting_customer_decision: number;
  nippon_purchase_pending: number;
  broker_listing_live: number;
  broker_completion_pending: number;
  nippon_purchases_closed: number;
  broker_deals_closed: number;
  cancelled_no_consent_expired: number;
  total: number;
};

export type CeoBranchRow = {
  branch_name: string;
  cases: number;
  nippon_closed: number;
  broker_closed: number;
  open_cases: number;
};

export type CeoAttentionCase = {
  id: string;
  case_ref: string | null;
  make: string | null;
  model: string | null;
  vehicle_reg_number: string | null;
  branch_name: string;
  po_name?: string | null;
  so_name?: string | null;
  offer_deadline_at?: string | null;
  customer_decision_at?: string | null;
};

export type CeoBrokerMarketplace = {
  live_listings: number;
  awaiting_completion: number;
  without_bids: number;
  closed_deals: number;
  deal_value: number;
};

export type CeoCohortCase = {
  id: string;
  case_ref: string | null;
  status: string;
  branch_name: string;
  submitted_at: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  vehicle_reg_number: string | null;
  nippon_amount: number | null;
  broker_amount: number | null;
};

export type CeoOverview = {
  kpis: CeoKpis;
  pipeline: CeoPipeline;
  branch_performance: CeoBranchRow[];
  attention: {
    due_soon: CeoAttentionCase[];
    expired: CeoAttentionCase[];
    accepted_pending: CeoAttentionCase[];
  };
  broker_marketplace: CeoBrokerMarketplace;
  cases: CeoCohortCase[];
};

export type CeoFunctions = {
  ceo_overview: {
    Args: { p_from?: string | null; p_to?: string | null; p_branch?: string | null };
    Returns: unknown;
  };
};
