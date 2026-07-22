import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/api";

export type EmployeeRecord = {
  id: string;
  employee_code?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  designation?: string | null;
  department?: string | null;
  manager?: string | null;
  status?: string | null;
  employment_type?: string | null;
  joining_date?: string | null;
  official_email?: string | null;
  salary?: string | null;
  current_salary?: number | null;
  personal_email?: string | null;
  phone?: string | null;
  dob?: string | null;
  gender?: string | null;
  bank_account_number?: string | null;
  ifsc_code?: string | null;
  pan_number?: string | null;
  aadhaar_number?: string | null;
  uan_number?: string | null;
  department_id?: string | null;
  designation_id?: string | null;
  reporting_manager_id?: string | null;
  seat_label?: string | null;
  onboarding_percent?: number | null;
};

export type EmployeeFormOptions = {
  departments: Array<{ id: string; name: string }>;
  designations: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; name: string }>;
};

export type EmployeeCreatePayload = {
  first_name: string;
  last_name: string;
  employee_code?: string;
  joining_date: string;
  employment_status: string;
  employment_type: string;
  department_id?: string;
  designation_id?: string;
  reporting_manager_id?: string;
  official_email?: string;
  personal_email: string;
  phone?: string;
  dob?: string;
  gender?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  pan_number?: string;
  aadhaar_number?: string;
  uan_number?: string;
  current_salary?: number;
  emergency_contact?: Record<string, unknown>;
};

export type EmployeeListResponse = {
  items: EmployeeRecord[];
  total: number;
  page: number;
  page_size: number;
};

export function getEmployees() {
  return apiGet<EmployeeListResponse>("/employees?page_size=50");
}

export function getEmployeeFormOptions() {
  return apiGet<EmployeeFormOptions>("/employees/form-options");
}

export function createEmployee(payload: EmployeeCreatePayload) {
  return apiPost<EmployeeRecord>("/employees", payload);
}

export function getEmployee(employeeId: string) {
  return apiGet<EmployeeRecord>(`/employees/${employeeId}`);
}

export function updateEmployee(employeeId: string, payload: Partial<EmployeeCreatePayload>) {
  return apiPatch<EmployeeRecord>(`/employees/${employeeId}`, payload);
}

export function deleteEmployee(employeeId: string) {
  return apiDelete<{ status: string; employee_id: string }>(`/employees/${employeeId}`);
}

export type OnboardingProgressItem = {
  key: string;
  label: string;
  complete: boolean;
  tab: string;
};

export type OnboardingProgress = {
  percent: number;
  items: OnboardingProgressItem[];
  completed: string[];
  pending: string[];
  welcome_kit_ready: boolean;
};

export function getEmployeeOnboardingProgress(employeeId: string) {
  return apiGet<OnboardingProgress>(`/employees/${employeeId}/onboarding-progress`);
}

export function sendWelcomeKit(employeeId: string) {
  return apiPost<OnboardingProgress>(`/employees/${employeeId}/send-welcome-kit`, {});
}

export function deactivateEmployee(employeeId: string) {
  return apiPost<EmployeeRecord>(`/employees/${employeeId}/deactivate`, {});
}

export function setEmployeeSeat(employeeId: string, seatLabel: string) {
  return apiPost<OnboardingProgress>(`/employees/${employeeId}/seat`, { seat_label: seatLabel });
}

export type EmployeeDocumentRecord = {
  id: string;
  employee_id: string;
  employee_name: string;
  document_type: string;
  document_url: string;
  status: string;
  expiry_date?: string | null;
  verified_at?: string | null;
  created_at?: string | null;
};

export function uploadEmployeeDocument(employeeId: string, documentType: string, file: File) {
  const formData = new FormData();
  formData.append("employee_id", employeeId);
  formData.append("document_type", documentType);
  formData.append("file", file);
  return apiPost<EmployeeDocumentRecord>("/documents", formData);
}