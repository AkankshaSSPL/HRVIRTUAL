import { apiGet, apiPost } from "@/services/api";

export type SalaryBreakupItem = {
  component_code: string;
  component_name: string;
  type: string;
  calculation_type: string;
  calculation_value?: number | null;
  reference_component_code?: string | null;
  amount: number;
  amount_display: string;
};

export type SalaryAssignmentSummary = {
  id: string | null;
  employee_id: string;
  employee_name?: string | null;
  salary_structure_id: string | null;
  salary_structure?: string | null;
  gross_salary: number;
  gross_salary_display: string;
  old_salary_display?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  status: string;
};

export type SalaryBreakup = {
  gross_salary_display: string;
  earnings_display: string;
  deductions_display: string;
  net_salary_display: string;
  items: SalaryBreakupItem[];
};

export type EmployeeSalaryResponse = {
  current: SalaryAssignmentSummary | null;
  breakup: SalaryBreakup | null;
  history: Array<Record<string, unknown>>;
  structure_assigned?: boolean;
};

export type PayrollImpactResponse = {
  employee_id: string;
  employee_name: string;
  employment_type: string;
  month: number;
  year: number;
  salary_ready: boolean;
  attendance: {
    working_days: number;
    payable_days: number;
    lop_days: number;
  };
  gross_salary_display?: string;
  other_deductions_display?: string;
  lop_deduction_display?: string;
  estimated_net_display?: string;
  blocking_issues: string[];
};

export function getEmployeeSalary(employeeId: string) {
  return apiGet<EmployeeSalaryResponse>(`/salary-assignments/employees/${employeeId}`);
}

export function getEmployeePayrollImpact(employeeId: string, month: number, year: number) {
  return apiGet<PayrollImpactResponse>(`/salary-assignments/employees/${employeeId}/payroll-impact?month=${month}&year=${year}`);
}

export function submitSalaryAssignmentCommand(command: string) {
  return apiPost<Record<string, unknown>>("/salary-assignments/command", { command });
}

export type SalaryStructureOption = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  active: boolean;
};

export function getSalaryStructures() {
  return apiGet<SalaryStructureOption[]>("/payroll/structures");
}

export type CreateSalaryAssignmentPayload = {
  employee_id: string;
  salary_structure_id: string;
  gross_salary: number;
  effective_from: string;
  reason?: string;
};

export function createSalaryAssignment(payload: CreateSalaryAssignmentPayload) {
  return apiPost<SalaryAssignmentSummary>("/payroll/salary-assignments", payload);
}