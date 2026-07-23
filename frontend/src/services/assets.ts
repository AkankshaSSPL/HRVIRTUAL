import { apiGet, apiPatch, apiPost } from "@/services/api";

export type AssetRecord = {
  id: string;
  employee_id: string;
  employee_name: string;
  asset_type: string;
  asset_name: string | null;
  asset_code: string;
  asset_status: string;
  assigned_at: string | null;
  returned_at: string | null;
  validity_date: string | null;
  is_expired: boolean;
};

export function getAssets(employeeId?: string, status?: string): Promise<AssetRecord[]> {
  const params = new URLSearchParams();
  if (employeeId) params.set("employee_id", employeeId);
  if (status) params.set("status", status);
  const qs = params.toString();
  return apiGet<AssetRecord[]>(`/assets${qs ? `?${qs}` : ""}`);
}

export function getAssetTypes(): Promise<{ types: string[] }> {
  return apiGet<{ types: string[] }>("/assets/types");
}

export function createAsset(payload: {
  employee_id: string;
  asset_type: string;
  asset_name?: string;
  validity_date?: string;
}): Promise<AssetRecord> {
  return apiPost<AssetRecord>("/assets", payload);
}

export function updateAssetStatus(assetId: string, status: string): Promise<AssetRecord> {
  return apiPatch<AssetRecord>(`/assets/${assetId}`, { status });
}
