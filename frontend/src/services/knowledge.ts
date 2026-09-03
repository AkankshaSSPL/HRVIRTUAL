import { useAuthStore } from "@/stores/authStore"; // adjust path to match your actual auth store location

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001/api/v1";

export function getBackendUrl(path: string): string {
    const backendRoot = API_BASE.replace(/\/api\/v1\/?$/, "");
    return `${backendRoot}${path.startsWith("/") ? "" : "/"}${path}`;
}

export interface Citation {
    title: string;
    version: string | null;
    file_url: string;
    snippet: string;
}

export interface ChatResponse {
    answer: string;
    citations: Citation[];
    used_documents: number;
}

export interface HistoryMessage {
    role: "user" | "assistant";
    content: string;
    citations: Citation[] | null;
    created_at: string;
}

export interface KnowledgeDocument {
    id: string;
    title: string;
    category: string | null;
    searchable: boolean;
    indexed_at: string | null;
    chunk_count: number;
}

function authHeaders(): HeadersInit {
    const token = useAuthStore.getState().accessToken;
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
            `Knowledge API error ${response.status}: ${body || response.statusText}`
        );
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return (await response.json()) as T;
}

export async function sendKnowledgeChat(message: string): Promise<ChatResponse> {
    const response = await fetch(`${API_BASE}/knowledge/chat`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message }),
    });
    return handleResponse<ChatResponse>(response);
}

export async function getKnowledgeHistory(): Promise<HistoryMessage[]> {
    const response = await fetch(`${API_BASE}/knowledge/history`, {
        method: "GET",
        headers: authHeaders(),
    });
    return handleResponse<HistoryMessage[]>(response);
}

export async function clearKnowledgeHistory(): Promise<void> {
    const response = await fetch(`${API_BASE}/knowledge/history`, {
        method: "DELETE",
        headers: authHeaders(),
    });
    return handleResponse<void>(response);
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
    const response = await fetch(`${API_BASE}/knowledge/documents`, {
        method: "GET",
        headers: authHeaders(),
    });
    return handleResponse<KnowledgeDocument[]>(response);
}

export async function reindexKnowledgeDocument(documentId: string): Promise<{ status: string }> {
    const response = await fetch(`${API_BASE}/knowledge/documents/${documentId}/reindex`, {
        method: "POST",
        headers: authHeaders(),
    });
    return handleResponse<{ status: string }>(response);
}

export async function setKnowledgeDocumentSearchable(
    documentId: string,
    searchable: boolean
): Promise<KnowledgeDocument> {
    const response = await fetch(`${API_BASE}/knowledge/documents/${documentId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ searchable }),
    });
    return handleResponse<KnowledgeDocument>(response);
}