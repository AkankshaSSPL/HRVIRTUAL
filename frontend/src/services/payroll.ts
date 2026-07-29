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
// NOTE: There is no REST API for generating/exporting/approving payroll runs.
// PayrollAgent only exposes these as chat actions ("process", "export",
// "submit_approval") dispatched from free-text commands, rendered via
// structured_response types "payroll_summary" / "payroll_export" inside
// AgentCommandPage.tsx. PayrollRunCard and PayrollExportDownload belong
// there, driven by onSend(...), not by REST calls from PayrollPage.tsx.
// Nothing to export here until/unless you add real REST endpoints for it.