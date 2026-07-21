import { apiGet } from "@/services/api";

export type LookupOption = {
  id: string;
  code: string;
  label: string;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export type LookupMap = Record<string, LookupOption[]>;

export function getLookups(categories?: string[]) {
  const query = categories?.length ? `?categories=${encodeURIComponent(categories.join(","))}` : "";
  return apiGet<LookupMap>(`/lookups${query}`);
}
