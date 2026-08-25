import { useAuthStore } from "@/stores/authStore";
import type { TokenResponse } from "@/types/auth";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001/api/v1";

/** Convert HTMLCanvasElement to base64 JPEG string (no data: prefix) */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
}

export async function detectFaces(
    imageBase64: string
): Promise<{ face_count: number; boxes: number[][] }> {
    const res = await fetch(`${API_BASE_URL}/face-auth/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageBase64 }),
    });
    if (!res.ok) throw new Error("Face detection failed");
    return res.json();
}

export async function faceLoginRequest(imageBase64: string): Promise<TokenResponse> {
    const res = await fetch(`${API_BASE_URL}/face-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageBase64 }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Face not recognized");
    }
    return res.json();
}

export async function selfEnroll(imagesBase64: string[]): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_BASE_URL}/face-auth/me/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ images_base64: imagesBase64 }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Enrollment failed");
    }
}

export async function selfRemoveFace(): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_BASE_URL}/face-auth/me/face`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Removal failed");
    }
}

export async function adminEnrollFace(
    userId: string,
    imagesBase64: string[]
): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_BASE_URL}/face-auth/users/${userId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ images_base64: imagesBase64 }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Enrollment failed");
    }
}

export async function adminRemoveFace(userId: string): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_BASE_URL}/face-auth/users/${userId}/face`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Removal failed");
    }
}

export type FaceAttempt = {
    id: string;
    user_id: string | null;
    user_name: string | null;
    success: boolean;
    confidence_score: number | null;
    ip_address: string | null;
    failure_reason: string | null;
    attempted_at: string;
};

export async function getFaceAttempts(params?: {
    user_id?: string;
    success?: boolean;
    limit?: number;
}): Promise<FaceAttempt[]> {
    const token = useAuthStore.getState().accessToken;
    const qs = new URLSearchParams();
    if (params?.user_id) qs.set("user_id", params.user_id);
    if (params?.success !== undefined) qs.set("success", String(params.success));
    if (params?.limit) qs.set("limit", String(params.limit));
    const res = await fetch(`${API_BASE_URL}/face-auth/attempts?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load face attempts");
    return res.json();
}