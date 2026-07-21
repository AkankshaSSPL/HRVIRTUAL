import { apiGet, apiPost } from "@/services/api";

export type AttendanceCell = {
  id?: string | null;
  employee_id: string;
  employee_name: string;
  attendance_date: string;
  date: string;
  status: string;
  attendance_status: string;
  label: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  total_hours?: number | null;
  remarks?: string | null;
  source?: string | null;
};

export type AttendanceMatrixRow = {
  employee_id: string;
  employee_name: string;
  department: string;
  designation: string;
  employment_type: string;
  status: string;
  cells: AttendanceCell[];
  totals: Record<string, number>;
  payable_days: number;
  working_days: number;
};

export type AttendanceMatrixResponse = {
  month: number;
  year: number;
  days: Array<{ date: string; day: number; weekday: string }>;
  rows: AttendanceMatrixRow[];
  legend: Record<string, { label: string; color: string; icon: string }>;
  summary: Record<string, number>;
  pagination: {
    page: number;
    page_size: number;
    total_rows: number;
    total_pages: number;
  };
};

export type EmployeeAttendanceSummary = {
  employee_id: string;
  employee_name: string;
  employment_type: string;
  month: number;
  year: number;
  working_days: number;
  payable_days: number;
  present_days: number;
  wfh_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  half_days: number;
  lop_days: number;
  records: AttendanceCell[];
};

export function getAttendanceMatrix(params: { month: number; year: number; employee?: string; department?: string; status?: string; page?: number; page_size?: number }) {
  const search = new URLSearchParams({ month: String(params.month), year: String(params.year) });
  if (params.employee) search.set("employee", params.employee);
  if (params.department) search.set("department", params.department);
  if (params.status) search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  return apiGet<AttendanceMatrixResponse>(`/attendance/matrix?${search.toString()}`);
}

export function getAttendanceDashboard() {
  return apiGet<Record<string, number | string>>("/attendance/dashboard");
}

export function getEmployeeAttendanceSummary(employeeId: string, month: number, year: number) {
  return apiGet<EmployeeAttendanceSummary>(`/attendance/employees/${employeeId}/summary?month=${month}&year=${year}`);
}

export function updateAttendanceCell(payload: { employee_id: string; attendance_date: string; status: string; remarks?: string }) {
  return apiPost<AttendanceCell>("/attendance/actions", payload);
}
