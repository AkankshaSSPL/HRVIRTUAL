import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/services/api";

export type SalaryComponentRecord = {
  id: string;
  name: string;
  code: string;
  type: string;
  calculation_type: string;
  calculation_value?: number | null;
  formula?: string | null;
  reference_component_code?: string | null;
  taxable: boolean;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};
export function getSalaryComponents() {
  return apiGet<SalaryComponentRecord[]>("/payroll/components");
}
export function createSalaryComponent(payload: Omit<SalaryComponentRecord, "id" | "created_at" | "updated_at">) {
  return apiPost<SalaryComponentRecord>("/payroll/components", payload);
}
export function updateSalaryComponent(componentId: string, payload: Partial<Omit<SalaryComponentRecord, "id" | "created_at" | "updated_at">>) {
  return apiPut<SalaryComponentRecord>(`/payroll/components/${componentId}`, payload);
}
export function deleteSalaryComponent(componentId: string) {
  return apiDelete<{ status: string; component_id: string }>(`/payroll/components/${componentId}`);
}

export type SalaryStructureRecord = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  active: boolean;
  item_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};
export function getSalaryStructures() {
  return apiGet<SalaryStructureRecord[]>("/payroll/structures");
}
export function createSalaryStructure(payload: { name: string; code?: string | null; description?: string | null; items: any[] }) {
  return apiPost<SalaryStructureRecord>("/payroll/structures", payload);
}

// ── Salary Assignments ────────────────────────────────────────────────────────
export type SalaryAssignmentRecord = {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  salary_structure_id: string;
  salary_structure?: string | null;
  gross_salary: number;
  gross_salary_display: string;
  effective_from: string;
  effective_to?: string | null;
  status: string;
  approved_by?: string | null;
};
export function createSalaryAssignment(payload: {
  employee_id: string;
  salary_structure_id: string;
  gross_salary: number;
  effective_from: string;
  reason?: string | null;
}) {
  return apiPost<SalaryAssignmentRecord>("/payroll/salary-assignments", payload);
}
export function getEmployeeSalaryAssignments(employeeId: string) {
  return apiGet<SalaryAssignmentRecord[]>(`/payroll/salary-assignments/employee/${employeeId}`);
}

// ── Payroll Config ─────────────────────────────────────────────────────────
export type ProfessionalTaxSlab = {
  min: number;
  max: number | null;
  amount: number;
};

export type PayrollConfigRecord = {
  id: string;
  epf_wage_cap: number;
  epf_employee_rate: number;
  epf_employer_rate: number;
  professional_tax_slabs: ProfessionalTaxSlab[] | null;
  consultant_tds_rate: number;
  consultant_base_working_days: number;
  employee_base_working_days: number;
  active: boolean;
};

export type PayrollConfigUpdatePayload = {
  epf_wage_cap: number;
  epf_employee_rate: number;
  epf_employer_rate: number;
  consultant_tds_rate: number;
  consultant_base_working_days: number;
  employee_base_working_days: number;
  professional_tax_slabs: ProfessionalTaxSlab[];
};

export function getPayrollConfig() {
  return apiGet<PayrollConfigRecord>("/payroll/config");
}
export function updatePayrollConfig(payload: PayrollConfigUpdatePayload) {
  return apiPut<PayrollConfigRecord>("/payroll/config", payload);
}

// ── Company Settings ───────────────────────────────────────────────────────
export type CompanySettingsRecord = {
  id: string;
  company_name: string;
  company_pan: string | null;
  company_tan: string | null;
  gstin: string | null;
  payroll_bank_account: string | null;
  payroll_bank_name: string | null;
  payroll_bank_ifsc: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  active: boolean;
};

export type CompanySettingsUpdatePayload = Partial<Omit<CompanySettingsRecord, "id" | "active">> & {
  company_name: string;
};

export async function getCompanySettings(): Promise<CompanySettingsRecord | null> {
  try {
    return await apiGet<CompanySettingsRecord>("/payroll/company-settings");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
export function updateCompanySettings(payload: CompanySettingsUpdatePayload) {
  return apiPut<CompanySettingsRecord>("/payroll/company-settings", payload);
}

// ── Employee TDS Config ────────────────────────────────────────────────────
export type EmployeeTDSConfigPayload = {
  financial_year: string;
  monthly_tds: number;
  annual_tax_liability?: number;
  tax_regime?: "NEW" | "OLD";
  effective_from: string; // yyyy-mm-dd
  remarks?: string;
};

export type EmployeeTDSConfigRecord = EmployeeTDSConfigPayload & {
  id: string;
  employee_id: string;
};

export function createEmployeeTDSConfig(employeeId: string, payload: EmployeeTDSConfigPayload) {
  return apiPost<EmployeeTDSConfigRecord>(`/payroll/employee-tds-config/${employeeId}`, payload);
}
export function updateEmployeeTDSConfig(employeeId: string, configId: string, payload: EmployeeTDSConfigPayload) {
  return apiPut<EmployeeTDSConfigRecord>(`/payroll/employee-tds-config/${employeeId}/${configId}`, payload);
}
export function getEmployeeTDSConfigs(employeeId: string) {
  return apiGet<EmployeeTDSConfigRecord[]>(`/payroll/employee-tds-config/${employeeId}`);
}

// ── Payroll Runs ────────────────────────────────────────────────────────────
export type PayrollRunSummary = {
  id: string;
  month: number;
  year: number;
  status: string;
  employee_count: number;
  net_payable: number;
  skipped: string[];
  approved_at: string | null;
};

export function getPayrollRuns() {
  return apiGet<PayrollRunSummary[]>("/payroll/runs");
}

export function generatePayrollRun(month: number, year: number) {
  return apiPost<PayrollRunSummary>("/payroll/runs", { month, year });
}

export function submitPayrollApproval(runId: string) {
  return apiPost<PayrollRunSummary>(`/payroll/runs/${runId}/submit-approval`, {});
}

export function exportPayrollSheet(runId: string, type: "employee" | "consultant" | "bank" | "tds") {
  return apiPost<{ filename: string; download_url: string }>(`/payroll/runs/${runId}/export`, { type });
}

// ── Pay Types ──────────────────────────────────────────────────────────────
export type PayTypeRuleRecord = {
  id: string;
  pay_type_id: string;
  sequence: number;
  code: string;
  label: string;
  kind: string;
  calc_type: string;
  value?: number | null;
  reference_code?: string | null;
  formula?: string | null;
  taxable: boolean;
  prorate: boolean;
};

export type PayTypeRecord = {
  id: string;
  code: string;
  name: string;
  pay_basis: string;
  proration_basis: string;
  base_working_days?: number | null;
  active: boolean;
  description?: string | null;
  rules: PayTypeRuleRecord[];
};

export function getPayTypes(activeOnly = true) {
  return apiGet<PayTypeRecord[]>(`/pay-types/?active_only=${activeOnly}`);
}

export function createPayType(payload: {
  code: string;
  name: string;
  pay_basis?: string;
  proration_basis?: string;
  base_working_days?: number | null;
  description?: string | null;
}) {
  return apiPost<PayTypeRecord>("/pay-types/", payload);
}

export function updatePayType(id: string, payload: Partial<{
  name: string;
  pay_basis: string;
  proration_basis: string;
  base_working_days: number | null;
  description: string | null;
  active: boolean;
}>) {
  return apiPut<PayTypeRecord>(`/pay-types/${id}`, payload);
}

export function deletePayType(id: string) {
  return apiDelete<void>(`/pay-types/${id}`);
}

export function setPayTypeRules(id: string, rules: Array<{
  sequence?: number;
  code: string;
  label?: string;
  kind: string;
  calc_type: string;
  value?: number | null;
  reference_code?: string | null;
  formula?: string | null;
  taxable?: boolean;
  prorate?: boolean;
}>) {
  return apiPut<PayTypeRecord>(`/pay-types/${id}/rules`, { rules });
}

// ── LOP Audit ──────────────────────────────────────────────────────────────
export type LopAuditRecord = {
  employee_id: string;
  employee_name: string;
  employment_type: string;
  working_days: number;
  days_worked: number;
  lop_days: number;
  gross_salary: number;
  net_salary: number;
};

export function getPayrollLopAudit(runId: string, filterType?: "ALL" | "EMPLOYEE" | "CONSULTANT") {
  const query = filterType && filterType !== "ALL" ? `?filter_type=${filterType}` : "";
  return apiGet<LopAuditRecord[]>(`/payroll/runs/${runId}/lop-audit${query}`);
}