import { apiGet, apiPost, apiPatch, apiDelete } from "@/services/api";

export type EmployeeDocumentRecord = {
  id: string;
  employee_id: string;
  employee_name: string;
  document_type: string;
  document_url: string;
  status: string;
  expiry_date?: string | null;
  verified_at?: string | null;
  created_at?: string | null;
};

export function getDocuments() {
  return apiGet<EmployeeDocumentRecord[]>("/documents");
}

export function createDocument(formData: FormData) {
  return apiPost<EmployeeDocumentRecord>("/documents", formData);
}

export function verifyDocument(documentId: string) {
  return apiPatch<EmployeeDocumentRecord>(`/documents/${documentId}/verify`, {});
}

export function deleteDocument(documentId: string) {
  return apiDelete<{ status: string }>(`/documents/${documentId}`);
}