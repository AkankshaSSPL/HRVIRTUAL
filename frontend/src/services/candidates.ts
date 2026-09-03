import { apiGet, apiPost, apiDelete, apiPatch } from "./api";

export interface Candidate {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  current_company?: string;
  expected_ctc?: number;
  current_ctc?: number;
  notice_period?: string;
  candidate_status: string;
  source?: string;
  created_at: string;
  resume_url?: string;
  parsed_resume_json?: any;
}

export interface CandidateCreateRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  current_company?: string;
  expected_ctc?: number;
  current_ctc?: number;
  notice_period?: string;
  source?: string;
  experience_years?: number;
  city?: string;
  state?: string;
  resume_url?: string;
}

export type CandidateUpdateRequest = Partial<CandidateCreateRequest>;

export function getCandidates() {
  return apiGet<Candidate[]>("/candidates");
}

export function getCandidate(id: string) {
  return apiGet<Candidate>(`/candidates/${id}`);
}

export function createCandidate(payload: CandidateCreateRequest) {
  return apiPost<CandidateCreateRequest, Candidate>("/candidates", payload);
}

export function updateCandidate(id: string, payload: CandidateUpdateRequest) {
  return apiPatch<Candidate>(`/candidates/${id}`, payload);
}

export function startOnboarding(candidateId: string) {
  return apiPost<unknown, { message: string; employee_id: string }>(
    `/candidates/${candidateId}/start-onboarding`,
    {}
  );
}

export function deleteCandidate(candidateId: string) {
  return apiDelete(`/candidates/${candidateId}`);
}
