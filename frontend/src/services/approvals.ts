import { apiGet, apiPost } from "@/services/api";

export type ApprovalEvent = {
  id: string;
  event_type: string;
  message: string;
  payload_json: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
};

export type ApprovalAuditLog = {
  id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
};

export type ApprovalRequest = {
  id: string;
  module_name: string;
  action_name: string;
  payload_json: Record<string, unknown> | null;
  status: string;
  execution_status: string;
  workflow_id: string | null;
  workflow_state_json: Record<string, unknown> | null;
  approval_reason: string | null;
  requested_by: string | null;
  approved_by: string | null;
  rejected_by: string | null;
  resumed_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
  events: ApprovalEvent[];
  audit_logs: ApprovalAuditLog[];
};

export function getPendingApprovals() {
  return apiGet<ApprovalRequest[]>("/approvals/pending");
}

export function getApproval(id: string) {
  return apiGet<ApprovalRequest>(`/approvals/${id}`);
}

export function approveApproval(id: string, comment?: string) {
  return apiPost<ApprovalRequest>(`/approvals/${id}/approve`, { comment });
}

export function rejectApproval(id: string, comment?: string) {
  return apiPost<ApprovalRequest>(`/approvals/${id}/reject`, { comment });
}

export function needsChangesApproval(id: string, comment?: string) {
  return apiPost<ApprovalRequest>(`/approvals/${id}/needs-changes`, { comment });
}

export function resumeApprovalWorkflow(id: string) {
  return apiPost<ApprovalRequest>(`/approvals/${id}/resume-workflow`);
}
