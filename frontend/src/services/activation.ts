import type { TokenResponse } from "@/types/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001/api/v1";

export type ActivationInfo = {
    valid: boolean;
    first_name?: string | null;
    email?: string | null;
    face_optional: boolean;
};

export async function getActivationInfo(token: string): Promise<ActivationInfo> {
    const response = await fetch(`${API_BASE_URL}/auth/activation/${token}`);

    if (!response.ok) {
        throw new Error("This activation link is invalid or has expired.");
    }

    return response.json() as Promise<ActivationInfo>;
}

export async function activateAccount(token: string, password: string): Promise<TokenResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Activation failed. The link may be invalid or expired.");
    }

    return response.json() as Promise<TokenResponse>;
}