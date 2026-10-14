export type PtlBranch = {
  id: string;
  name: string;
  code: string;
};

export type PtlUnassignedCase = {
  id: string;
  case_ref: string | null;
  branch_id: string;
  branch_name: string;
  make: string | null;
  model: string | null;
  variant: string | null;
  customer_name: string | null;
  customer_expected_price: number | null;
  so_name: string | null;
  so_employee_id: string | null;
  submitted_at: string | null;
};

export type PtlPoWorkload = {
  po_id: string;
  po_name: string;
  po_employee_id: string;
  branch_id: string;
  branch_name: string;
  open_case_count: number;
  last_assigned_at: string | null;
};

export type PtlDashboard = {
  branches: PtlBranch[];
  unassigned: PtlUnassignedCase[];
  po_workload: PtlPoWorkload[];
};

export type PtlCaseListItem = {
  id: string;
  case_ref: string | null;
  branch_id: string;
  branch_name: string;
  po_id: string | null;
  po_name: string | null;
  po_employee_id: string | null;
  so_name: string | null;
  so_employee_id: string | null;
  vehicle_reg_number: string | null;
  customer_name: string | null;
  customer_expected_price: number | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  status: string;
  offer_price: number | null;
  submitted_at: string | null;
  evaluation_started_at: string | null;
};

export type PtlCaseList = {
  total: number;
  items: PtlCaseListItem[];
};

export type PtlCaseDetail = {
  id: string;
  case_ref: string | null;
  status: string;
  branch_id: string;
  branch_name: string;
  sales_officer_name: string | null;
  sales_officer_employee_id: string | null;
  po_id: string | null;
  po_name: string | null;
  po_employee_id: string | null;
  customer_name: string | null;
  customer_expected_price: number | null;
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

export type PtlBranchPo = {
  id: string;
  full_name: string;
  employee_id: string;
  open_case_count: number;
};

export type PtlFunctions = {
  ptl_dashboard: { Args: Record<PropertyKey, never>; Returns: unknown };
  ptl_cases: {
    Args: { p_branch?: string; p_status?: string; p_search?: string; p_page?: number };
    Returns: unknown;
  };
  ptl_case: { Args: { p_case_id: string }; Returns: unknown };
  ptl_branch_pos: { Args: { p_branch_id: string }; Returns: unknown };
  ptl_assign_po: { Args: { p_case_id: string; p_po_id: string }; Returns: unknown };
};
