import { apiDelete, apiGet, apiPost, apiPut } from "@/services/api";

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