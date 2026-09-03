import { apiGet, apiPost } from "@/services/api";
import { getEmployees, type EmployeeRecord } from "@/services/employees";

export type LeaveBalance = {
  employee_id: string;
  employee_name: string;
  leave_type: string;
  leave_type_id?: string | null;
  year: number;
  allocated: number;
  used: number;
  remaining: number;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  from_date?: string;
  to_date?: string;
  start_date?: string;
  end_date?: string;
  total_days: number;
  status: string;
  reason?: string | null;
};

export type EmployeeLeaveSummary = {
  employee: EmployeeRecord;
  balances: LeaveBalance[];
  allocated: number;
  used: number;
  remaining: number;
};

export type LeaveWorkspace = {
  employees: EmployeeLeaveSummary[];
  pending: LeaveRequest[];
  calendar: LeaveRequest[];
};

export type MyLeaveWorkspace = {
  balances: LeaveBalance[];
  history: LeaveRequest[];
};

export type LeavePolicy = {
  id: string;
  name: string;
  code: string;
  category: string;
  annual_allocation: number;
  requires_approval: boolean;
  affects_payroll: boolean;
};

export function getEmployeeLeaveBalances(employeeId: string, year?: number) {
  const query = year ? `?year=${year}` : "";
  return apiGet<LeaveBalance[]>(`/leave/employees/${employeeId}/balances${query}`);
}

export function getEmployeeLeaveHistory(employeeId: string) {
  return apiGet<LeaveRequest[]>(`/leave/employees/${employeeId}/history`);
}

export function getPendingLeaveRequests() {
  return apiGet<LeaveRequest[]>("/leave/pending");
}

export function getLeaveCalendar() {
  return apiGet<LeaveRequest[]>("/leave/calendar");
}

export function getLeavePolicies() {
  return apiGet<LeavePolicy[]>("/leave/policies");
}

export function applyLeave(payload: { employee_id: string; leave_type: string; start_date: string; end_date: string; reason?: string; whom_to_send?: string }) {
  return apiPost<LeaveRequest>("/leave/requests", payload);
}

export function getMyLeaveWorkspace(year?: number) {
  const query = year ? `?year=${year}` : "";
  return apiGet<MyLeaveWorkspace>(`/leave/my-workspace${query}`);
}

export function applyMyLeave(payload: { leave_type: string; start_date: string; end_date: string; reason?: string; whom_to_send?: string }) {
  return apiPost<LeaveRequest>("/leave/my-requests", payload);
}

export async function getLeaveWorkspace(year?: number): Promise<LeaveWorkspace> {
  const [employeeResponse, pending, calendar] = await Promise.all([
    getEmployees(),
    getPendingLeaveRequests(),
    getLeaveCalendar(),
  ]);
  const balanceSets = await Promise.all(employeeResponse.items.map((employee) => getEmployeeLeaveBalances(employee.id, year)));
  const employees = employeeResponse.items.map((employee, index) => {
    const balances = balanceSets[index] ?? [];
    const paidBalances = balances.filter((balance) => ["Paid Leave", "Casual Leave"].includes(balance.leave_type));
    return {
      employee,
      balances,
      allocated: paidBalances.reduce((total, balance) => total + Number(balance.allocated || 0), 0),
      used: paidBalances.reduce((total, balance) => total + Number(balance.used || 0), 0),
      remaining: paidBalances.reduce((total, balance) => total + Number(balance.remaining || 0), 0),
    };
  });
  return { employees, pending, calendar };
}
