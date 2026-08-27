import { useAuthStore } from "@/stores/authStore";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001/api/v1";
export const BACKEND_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  if (body instanceof FormData) {
    return apiRequest<T>(path, { method: "POST", body });
  }
  return apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}

// Downloads a file from an authenticated endpoint. A plain <a href download>
// tag can't attach the Authorization header, so this fetches the file as a
// blob (with auth + 401 refresh-retry, same as apiRequest) and triggers the
// save via a temporary object URL instead.
export async function apiDownloadFile(path: string, filename: string): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  let response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (response.status === 401) {
    const refreshedToken = await useAuthStore.getState().refreshSession();
    if (refreshedToken) {
      response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { ...headers, Authorization: `Bearer ${refreshedToken}` },
      });
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null;
    throw new ApiError(payload?.detail ?? `Download failed: ${response.status}`, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const isFormData = init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isFormData && init.body ? { "Content-Type": "application/json" } : {}),
  };
  let response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    const refreshedToken = await useAuthStore.getState().refreshSession();
    if (refreshedToken) {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: { ...headers, Authorization: `Bearer ${refreshedToken}` },
      });
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: any } | null;
    let errorMessage = `API request failed: ${response.status}`;
    if (payload?.detail) {
      if (typeof payload.detail === 'string') {
        errorMessage = payload.detail;
      } else if (Array.isArray(payload.detail) && payload.detail.length > 0 && payload.detail[0].msg) {
        errorMessage = payload.detail.map((e: any) => e.msg.replace('Value error, ', '')).join('; ');
      } else {
        errorMessage = JSON.stringify(payload.detail);
      }
    }
    throw new ApiError(errorMessage, response.status);
  }
  return response.json() as Promise<T>;
}