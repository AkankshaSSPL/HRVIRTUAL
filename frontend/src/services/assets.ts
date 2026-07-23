import { apiGet, apiPatch } from "@/services/api";

export type AssetRecord = {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  asset_type: string;
  asset_code: string;
  assigned_at?: string | null;
  returned_at?: string | null;
  asset_status: string;
};

export function getAssets(employeeId?: string, status?: string) {
  const params = new URLSearchParams();
  if (employeeId) params.set("employee_id", employeeId);
  if (status) params.set("status", status);
  const query = params.toString();
  return apiGet<AssetRecord[]>(`/assets${query ? `?${query}` : ""}`);
}

export function updateAssetStatus(assetId: string, status: string) {
  return apiPatch<AssetRecord>(`/assets/${assetId}/status`, { status });
}