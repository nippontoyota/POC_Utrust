export type PoManagerPendingCase = {
  id: string;
  submitted_at: string | null;
  evaluation_started_at: string | null;
  po_id: string;
  po_name: string;
  po_employee_id: string;
  branch_name: string;
};

export type PoManagerPoRow = {
  id: string;
  name: string;
  employee_id: string;
  branch_name: string;
  is_active: boolean;
  assigned_total: number;
  pending: number;
  evaluated: number;
};

export type PoManagerSummary = {
  total_cases: number;
  evaluated_total: number;
  closed_total: number;
  pending_cases: PoManagerPendingCase[];
  pos: PoManagerPoRow[];
};

export type PoManagerCaseListItem = {
  id: string;
  case_ref: string | null;
  branch_name: string;
  po_name: string;
  po_employee_id: string;
  make: string | null;
  model: string | null;
  variant: string | null;
  status: string;
  offer_price: number | null;
  submitted_at: string | null;
  evaluation_started_at: string | null;
};

export type PoManagerCaseList = {
  total: number;
  items: PoManagerCaseListItem[];
};

export type PoManagerCaseDetail = {
  id: string;
  case_ref: string | null;
  status: string;
  branch_name: string;
  sales_officer_name: string | null;
  sales_officer_employee_id: string | null;
  po_name: string | null;
  po_employee_id: string | null;
  vehicle_reg_number: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  registration_year: number | null;
  fuel_type: string | null;
  transmission: string | null;
  odometer_km: number | null;
  ownership_count: number | null;
  has_loan: boolean | null;
  lender_note: string | null;
  created_at: string;
  submitted_at: string | null;
  evaluation_started_at: string | null;
};

export type ManagerFunctions = {
  po_manager_summary: { Args: Record<PropertyKey, never>; Returns: unknown };
  po_manager_cases: {
    Args: { p_search?: string; p_branch?: string; p_status?: string; p_page?: number };
    Returns: unknown;
  };
  po_manager_case: { Args: { p_case_id: string }; Returns: unknown };
};
