import { useAuthStore } from "@/stores/authStore";
import { apiGet, apiPost } from "@/services/api";

export type RuntimeMessage = {
  id: string;
  type: "user_message" | "agent_message" | "system_message" | "approval_message" | "workflow_message";
  content: string;
  agent_name?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type RuntimeStep = {
  id: string;
  step_name: string;
  step_status: string;
  input_json: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  created_at: string;
};

export type RuntimeEvent = {
  id: string;
  workflow_id: string;
  event_type: string;
  agent_name: string | null;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type WorkflowRead = {
  workflow_id: string;
  run_id: string;
  agent_name: string;
  status: string;
  current_agent: string | null;
  current_step: string;
  workflow_status: string;
  approval_status: string | null;
  approval_request_id: string | null;
  messages: RuntimeMessage[];
  execution_history: Record<string, unknown>[];
  result: Record<string, unknown>;
  events: RuntimeEvent[];
  steps: RuntimeStep[];
  started_at: string | null;
  completed_at: string | null;
};

export type AgentCommandWorkflow = {
  workflow_id: string;
  status: string;
  active_agent: string | null;
  current_step: string;
  messages: RuntimeMessage[];
  steps: RuntimeStep[];
  timeline_events: RuntimeEvent[];
  approval_status: string | null;
  approval_request_id: string | null;
  initial_response: string | null;
  result: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
};

export type AgentMetadata = {
  name: string;
  description: string;
  supported_actions: string[];
  approval_required_actions: string[];
};

export function submitAgentCommand(command: string) {
  return apiPost<AgentCommandWorkflow>("/agent-command/send", { user_message: command });
}

export function getWorkflows() {
  return apiGet<AgentCommandWorkflow[]>("/agent-command/workflows");
}

export function getWorkflow(workflowId: string) {
  return apiGet<AgentCommandWorkflow>(`/agent-command/workflows/${workflowId}`);
}

export function getOnboardingStateDebug(workflowId: string) {
  return apiGet<{ workflow_id: string; onboarding_state: Record<string, unknown>; debug: Record<string, unknown> }>(`/onboarding/state/${workflowId}`);
}

export function getAgentRegistry() {
  return apiGet<AgentMetadata[]>("/agents/registry");
}

export type ResumeUploadResponse = {
  upload: {
    id: string;
    original_filename: string;
    stored_filename: string;
    uploaded_at: string;
    content_type: string;
    file_size: number;
  };
  parsed: Record<string, unknown>;
  candidate: Record<string, unknown>;
  structured_response: Record<string, unknown>;
  suggested_command: string;
};

export async function uploadOnboardingResume(file: File, onProgress?: (progress: number) => void) {
  const formData = new FormData();
  formData.append("file", file);
  const token = useAuthStore.getState().accessToken;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001/api/v1";

  return new Promise<ResumeUploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${apiBaseUrl}/resume/upload`);
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText) as ResumeUploadResponse);
        return;
      }
      try {
        const payload = JSON.parse(request.responseText);
        reject(new Error(payload.detail || "Resume upload failed"));
      } catch {
        reject(new Error("Resume upload failed"));
      }
    };
    request.onerror = () => reject(new Error("Resume upload failed"));
    request.send(formData);
  });
}
