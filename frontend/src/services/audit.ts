import { apiGet } from "./api";

export type AuditLogEntry = {
  id: string;
  created_at: string;
  title: string;
  message: string;
  performed_by_name: string | null;
};

export type AuditLogsResponse = {
  logs: AuditLogEntry[];
  total: number;
};

export async function getAuditLogs(skip = 0, limit = 50): Promise<AuditLogsResponse> {
  return apiGet(`/audit-logs?skip=${skip}&limit=${limit}`);
}
