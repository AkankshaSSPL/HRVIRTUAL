import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/api";

export type MasterRecord = {
  id: string;
  name: string;
  label?: string;
  code?: string | null;
  category?: string | null;
  description?: string | null;
  level?: string | null;
  parent_department_id?: string | null;
  annual_allocation?: number;
  carry_forward_allowed?: boolean;
  requires_approval?: boolean;
  affects_payroll?: boolean;
  sort_order?: number;
  active: boolean;
};

export type MasterWorkspace = {
  departments: MasterRecord[];
  designations: MasterRecord[];
  leave_types: MasterRecord[];
  lookups: Record<string, MasterRecord[]>;
};

export function getMasters() {
  return apiGet<MasterWorkspace>("/masters");
}

export function createMaster(masterType: string, payload: Partial<MasterRecord>) {
  return apiPost<MasterRecord>(`/masters/${masterType}`, payload);
}

export function updateMaster(masterType: string, id: string, payload: Partial<MasterRecord>) {
  return apiPatch<MasterRecord>(`/masters/${masterType}/${id}`, payload);
}

export function deleteMaster(masterType: string, id: string) {
  return apiDelete<MasterRecord>(`/masters/${masterType}/${id}`);
}
