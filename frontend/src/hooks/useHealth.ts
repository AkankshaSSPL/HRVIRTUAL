import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/services/api";

type HealthResponse = {
  status: string;
  database: string;
};

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/health"),
  });
}

