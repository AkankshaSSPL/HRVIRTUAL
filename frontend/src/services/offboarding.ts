import { apiGet, apiPatch, apiPost } from "@/services/api";

export type OffboardingChecklistItem = {
    key: string;
    label: string;
    complete: boolean;
    auto: boolean;
};

export type OffboardingChecklist = {
    percent: number;
    items: OffboardingChecklistItem[];
    can_finalize: boolean;
};

export type OffboardingCaseRecord = {
    id: string;
    employee_id: string;
    status: "IN_PROGRESS" | "COMPLETED";
    initiated_by?: string | null;
    completed_at?: string | null;
    knowledge_transfer_done: boolean;
    exit_interview_done: boolean;
    final_settlement_done: boolean;
    id_card_returned: boolean;
    nda_signed: boolean;
    client_credentials_cleared: boolean;
    personal_logins_cleared: boolean;
    recovery_details_updated: boolean;
    notes?: string | null;
};

export type OffboardingDetail = {
    case: OffboardingCaseRecord;
    checklist: OffboardingChecklist;
    assets: {
        asset_type: string;
        asset_name: string | null;
        asset_code: string;
    }[];
    personal_info: {
        phone: string | null;
        official_email: string;
        personal_email: string | null;
        address: string | null;
        pan_number: string | null;
        aadhaar_number: string | null;
    };
};

export type OffboardingListItem = {
    employee_id: string;
    employee_name: string;
    exit_type?: string | null;
    exit_date?: string | null;
    status: "IN_PROGRESS" | "COMPLETED";
    percent: number;
};

export type InitiateOffboardingPayload = {
    exit_type: string;
    exit_reason?: string;
    exit_date: string;
};

export type UpdateOffboardingPayload = Partial<{
    knowledge_transfer_done: boolean;
    exit_interview_done: boolean;
    final_settlement_done: boolean;
    id_card_returned: boolean;
    nda_signed: boolean;
    client_credentials_cleared: boolean;
    personal_logins_cleared: boolean;
    recovery_details_updated: boolean;
    notes: string;
}>;

export function listOffboarding(status?: "IN_PROGRESS" | "COMPLETED") {
    const query = status ? `?status=${status}` : "";
    return apiGet<OffboardingListItem[]>(`/offboarding${query}`);
}

export function getOffboarding(employeeId: string) {
    return apiGet<OffboardingDetail>(`/offboarding/${employeeId}`);
}

export function initiateOffboarding(employeeId: string, payload: InitiateOffboardingPayload) {
    return apiPost<OffboardingDetail>(`/offboarding/${employeeId}/initiate`, payload);
}

export function updateOffboarding(employeeId: string, payload: UpdateOffboardingPayload) {
    return apiPatch<OffboardingDetail>(`/offboarding/${employeeId}`, payload);
}

export function finalizeOffboarding(employeeId: string) {
    return apiPost<{ case: OffboardingCaseRecord; employee: unknown }>(
        `/offboarding/${employeeId}/finalize`,
        {},
    );
}