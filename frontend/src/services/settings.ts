import { apiGet, apiPut } from "@/services/api";

export function getSettings(category: string): Promise<Record<string, any>> {
  return apiGet<Record<string, any>>(`/settings/${category}`);
}

export function updateSettings(category: string, payload: Record<string, any>): Promise<Record<string, any>> {
  return apiPut<Record<string, any>>(`/settings/${category}`, payload);
}
