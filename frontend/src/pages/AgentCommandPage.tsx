import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bot, CheckCircle2, ChevronRight, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AgentMessageBubble,
  ActionCard,
  ApprovalDiffCard,
  AppLayout,
  AttendanceSummaryCard,
  AttendanceTable,
  CandidateCard,
  CommandInput,
  DrawerPanel,
  EmployeePreviewCard,
  EmployeeTableCard,
  EmptyState,
  InlineEntityCard,
  LeaveSummaryCard,
  LeaveApprovalCard,
  LeaveBalanceCard,
  LeaveRequestCard,
  LOPSummaryCard,
  LoadingSkeleton,
  MissingFieldCard,
  OnboardingProgressCard,
  OnboardingSummaryCard,
  PageContainer,
  PageHeader,
  PayrollSummaryCard,
  StatusBadge,
  StatusBannerCard,
  ToastNotification,
  UserMessageBubble,
  type CandidateCardData,
  type EmployeeCardData,
} from "@/components/ui-system";
import { agentThemeFor, statusToneFor } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";
import { getOnboardingStateDebug, getWorkflow, getWorkflows, submitAgentCommand, uploadOnboardingResume, type AgentCommandWorkflow, type RuntimeEvent } from "@/services/agents";
import { getApproval, type ApprovalRequest } from "@/services/approvals";
import { useAuthStore } from "@/stores/authStore";

const suggestedActions = [
  "Show employees",
  "Generate payroll",
  "Start onboarding",
  "Create Basic salary as earning",
  "Create HRA as 40% of Basic",
  "Create PF as 12% of Basic deduction",
  "Create Professional Tax as ₹200 deduction",
  "Show salary components",
  "Update salary",
];

type StructuredResponse = {
  type?: string;
  title?: string;
  summary?: string;
  employee?: EmployeeCardData;
  employees?: EmployeeCardData[];
  payload?: Record<string, unknown>;
  actions?: string[];
  candidate?: Record<string, unknown>;
  steps?: Array<{ agent: string; title: string; status: string; summary: string }>;
  documents?: Array<{ name: string; status: string }>;
  assets?: Array<{ name: string; status: string }>;
  records?: Array<Record<string, unknown>>;
  matrix?: Record<string, unknown>;
  calendar?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  request?: Record<string, unknown>;
  requests?: Array<Record<string, unknown>>;
  policy?: Record<string, unknown>;
  balances?: Array<Record<string, unknown>>;
  structures?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  structure_code?: string;
  component_count?: number;
  gross?: number;
  approval_request_id?: string | null;
  breakup?: Record<string, unknown>;
  history?: Array<Record<string, unknown>>;
  assignments?: Array<Record<string, unknown>>;
  draft?: Record<string, unknown>;
  missing_fields?: string[];
  labels?: string[];
  field_sources?: Record<string, string>;
  status?: string;
  component?: {
    id?: string;
    name?: string;
    code?: string;
    type?: string;
    calculation_type?: string;
    calculation_value?: number;
    formula?: string;
    reference_component_code?: string;
    taxable?: boolean;
    active?: boolean;
  };
  components?: Array<{
    id?: string;
    name?: string;
    code?: string;
    type?: string;
    calculation_type?: string;
    calculation_value?: number;
    formula?: string;
    reference_component_code?: string;
    taxable?: boolean;
    active?: boolean;
  }>;
};

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  return statusToneFor(status);
}

function commandFromWorkflow(workflow: AgentCommandWorkflow) {
  return workflow.messages.find((message) => message.type === "user_message")?.content ?? "Workflow request";
}

function timestampValue(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0;
}

function visibleMessagesForWorkflow(workflow: AgentCommandWorkflow) {
  const messages = workflow.messages ?? [];
  const hasCompletedApprovalResult = messages.some((message) => (
    message.type === "workflow_message"
    && Boolean((message.metadata?.structured_response as StructuredResponse | undefined)?.type)
  ));
  if (!hasCompletedApprovalResult) return messages;
  return messages.filter((message) => message.type !== "approval_message");
}

function blockingMissingLabels(labels: string[]) {
  return labels.filter((label) => !["designation", "department"].includes(label.toLowerCase().replace(/\s+/g, "_")));
}

function agentLabel(agent?: string | null) {
  if (!agent) return "Coordinator Agent";
  return agent
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function friendlyStatus(status: string) {
  if (status === "WAITING_APPROVAL") return "Needs approval";
  if (status === "COMPLETED") return "Completed";
  if (status === "FAILED") return "Needs review";
  if (status === "RUNNING") return "Working";
  return "Queued";
}

function friendlyEvent(event: RuntimeEvent) {
  const type = event.event_type;
  if (type === "WORKFLOW_CREATED") return "Request received";
  if (type === "AGENT_STARTED") return event.agent_name ? "Agent activated" : "Request received";
  if (type === "EMPLOYEE_SEARCHED") return "Employee search completed";
  if (type === "EMPLOYEE_UPDATED") return "Employee update completed";
  if (type === "EMPLOYEE_CREATED") return "Employee created";
  if (type === "EMPLOYEE_DEACTIVATED") return "Employee deactivated";
  if (type === "ATTENDANCE_RECORDED") return "Attendance recorded";
  if (type === "ATTENDANCE_SUMMARY_GENERATED") return "Attendance summarized";
  if (type === "LEAVE_APPLIED") return "Leave request created";
  if (type === "LEAVE_APPROVED") return "Leave approved";
  if (type === "LEAVE_REJECTED") return "Leave rejected";
  if (type === "LOP_CALCULATED") return "LOP calculated";
  if (type === "TOOL_EXECUTED") return "Operation analyzed";
  if (type === "APPROVAL_REQUIRED") return "Approval requested";
  if (type === "WORKFLOW_PAUSED") return "Approval requested";
  if (type === "WORKFLOW_RESUMED") return "Workflow resumed";
  if (type === "AGENT_COMPLETED") return "Response prepared";
  if (type === "ERROR_OCCURRED") return "Needs review";
  return "Completed";
}

function friendlyDescription(event: RuntimeEvent) {
  const label = friendlyEvent(event);
  if (label === "Request received") return "The request was received by the AI workforce system.";
  if (label === "Agent activated") return `${agentLabel(event.agent_name)} was selected for this request.`;
  if (label === "Employee search completed") return "Employee records were retrieved from the HRMS directory.";
  if (label === "Attendance recorded") return "The attendance record was saved for payroll preparation.";
  if (label === "Attendance summarized") return "Attendance inputs were prepared for review.";
  if (label === "Leave request created") return "The leave request was captured for the employee.";
  if (label === "Leave approved") return "The approved leave was applied to the balance.";
  if (label === "LOP calculated") return "Loss of pay days were calculated from attendance and leave data.";
  if (label === "Approval requested") return "Human approval is required before continuing.";
  if (label === "Workflow resumed") return "The approved workflow resumed and executed.";
  if (label === "Response prepared") return "The agent prepared a response for the workspace.";
  if (label === "Needs review") return "The workflow needs attention before it can continue.";
  return "The workflow step was completed.";
}

function responseText(workflow: AgentCommandWorkflow, message: AgentCommandWorkflow["messages"][number]) {
  const metadata = message.metadata ?? {};
  const summary = metadata.execution_summary;
  if (typeof summary === "string") return summary;
  if (workflow.initial_response) return workflow.initial_response;
  return message.content;
}

function salaryFromCommand(command: string) {
  const match = command.match(/(?:salary|to)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)/i);
  if (!match) return null;
  return `₹${Number(match[1].replace(/,/g, "")).toLocaleString("en-IN")}`;
}

function employeeNameFromCommand(command: string) {
  const match = command.match(/employee\s+([a-z]+)|show\s+employee\s+([a-z]+)/i);
  const name = match?.[1] ?? match?.[2];
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : null;
}

function completionMessage(workflow: AgentCommandWorkflow, structuredResponse?: StructuredResponse) {
  const candidate = (structuredResponse?.candidate ?? structuredResponse?.draft ?? {}) as CandidateCardData;
  const name = candidate.name || employeeNameFromCommand(commandFromWorkflow(workflow)) || "The employee";
  if (workflow.active_agent?.includes("onboarding")) return `Done. ${name} has been onboarded successfully.`;
  if (workflow.active_agent?.includes("employee")) return "Done. Employee records are up to date.";
  if (workflow.active_agent?.includes("attendance")) return "Done. Attendance information is ready.";
  if (workflow.active_agent?.includes("leave")) return "Done. Leave information is ready.";
  return responseText(workflow, workflow.messages[workflow.messages.length - 1]);
}

function OnboardingDoneCard({ workflow, structuredResponse }: { workflow: AgentCommandWorkflow; structuredResponse?: StructuredResponse }) {
  const candidate = (structuredResponse?.candidate ?? structuredResponse?.draft ?? {}) as CandidateCardData;
  const theme = agentThemeFor("onboarding_agent");
  return (
    <div className={cn("space-y-3 rounded-lg border p-4 shadow-sm transition-all animate-in fade-in-50 slide-in-from-bottom-2", theme.soft)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", theme.icon)}>
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-base font-semibold">{completionMessage(workflow, structuredResponse)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">The employee directory and onboarding workspace have been refreshed.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <InlineEntityCard title={candidate.name ?? "New employee"} subtitle={candidate.designation ?? "Employee"} meta={candidate.department ?? "HRMS"} agent="employee_agent" />
        <InlineEntityCard title="Employee record" subtitle="Created and available" meta="Updated" agent="employee_agent" />
        <InlineEntityCard title="Onboarding" subtitle="Visible in workspace" meta="Live" agent="onboarding_agent" />
      </div>
    </div>
  );
}

function approvalIsCompleted(approval?: ApprovalRequest | null) {
  return approval?.status === "EXECUTED" || approval?.execution_status === "EXECUTED";
}

function approvalIsOpen(approval?: ApprovalRequest | null, fallbackId?: string | null) {
  if (!fallbackId) return false;
  if (!approval) return true;
  return ["PENDING", "APPROVED"].includes(approval.status) && approval.execution_status !== "EXECUTED";
}

function approvalDisplayStatus(approval?: ApprovalRequest | null) {
  if (approvalIsCompleted(approval)) return "Approved";
  if (!approval?.status) return "Approval Required";
  return approval.status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function BusinessResponse({
  workflow,
  message,
  onSend,
  onDraftCommand,
  approval,
}: {
  workflow: AgentCommandWorkflow;
  message: AgentCommandWorkflow["messages"][number];
  onSend: (value: string) => void;
  onDraftCommand: (value: string) => void;
  approval?: ApprovalRequest | null;
}) {
  const command = commandFromWorkflow(workflow);
  const commandLower = command.toLowerCase();
  const activeAgent = workflow.active_agent ?? String(message.metadata?.agent ?? "");
  const structuredResponse = message.metadata?.structured_response as StructuredResponse | undefined;

  if (structuredResponse?.type === "employee_card") {
    return (
      <EmployeePreviewCard
        employee={structuredResponse.employee}
        onUpdate={(employee) => onDraftCommand(`Update ${employee.name ?? "employee"} salary to `)}
        onDeactivate={(employee) => onDraftCommand(`Deactivate employee ${employee.name ?? ""}`.trim())}
      />
    );
  }
  if (structuredResponse?.type === "employee_table") return <EmployeeTableCard employees={structuredResponse.employees ?? []} summary={structuredResponse.summary} />;
  if (structuredResponse?.type === "missing_fields") {
    const labels = blockingMissingLabels(structuredResponse.labels ?? structuredResponse.missing_fields ?? []);
    if (!labels.length) {
      return (
        <OnboardingSummaryCard
          candidate={{ ...((structuredResponse.draft ?? structuredResponse.candidate ?? {}) as CandidateCardData), field_sources: structuredResponse.field_sources }}
          status="Ready"
          onStartOnboarding={() => onSend("Start onboarding")}
        />
      );
    }
    return <MissingFieldCard title={structuredResponse.title} summary={structuredResponse.summary} labels={labels} draft={{ ...(structuredResponse.draft as CandidateCardData), field_sources: structuredResponse.field_sources }} />;
  }
  if (structuredResponse?.type === "onboarding_summary") {
    return (
      <OnboardingSummaryCard
        candidate={{ ...((structuredResponse.draft ?? structuredResponse.candidate ?? {}) as CandidateCardData), field_sources: structuredResponse.field_sources }}
        status={structuredResponse.status ?? "Ready"}
        onStartOnboarding={structuredResponse.actions?.includes("Start Onboarding") ? () => onSend("Start onboarding") : undefined}
      />
    );
  }
  if (structuredResponse?.type === "onboarding_progress") return <OnboardingDoneCard workflow={workflow} structuredResponse={structuredResponse} />;
  if (structuredResponse?.type === "approval_diff" || structuredResponse?.type === "approval_diff_card") {
    const payload = structuredResponse.payload ?? {};
    return (
      <ApprovalDiffCard
        title={structuredResponse.title ?? "Salary Change Request"}
        currentSalary={payload.current_value ? String(payload.current_value) : "Not available"}
        newSalary={payload.proposed_value ? String(payload.proposed_value) : salaryFromCommand(command) ?? "Not available"}
        status={approvalDisplayStatus(approval)}
        completed={approvalIsCompleted(approval)}
      />
    );
  }
  if (structuredResponse?.type === "action_card") {
    return <ActionCard title={structuredResponse.title ?? "Approval required"} summary={structuredResponse.summary ?? "This employee action requires approval."} actions={structuredResponse.actions} />;
  }
  if (structuredResponse?.type === "confirmation_card") {
    return (
      <ActionCard
        title={structuredResponse.title ?? "Confirm employee update"}
        summary={structuredResponse.summary ?? "Confirm whether this employee change should be applied."}
        actions={structuredResponse.actions ?? ["Yes", "No"]}
        confirmation
        onAction={(action) => onSend(action)}
      />
    );
  }
  if (structuredResponse?.type === "status_banner") {
    return <StatusBannerCard title={structuredResponse.title ?? "Employee operation"} summary={structuredResponse.summary ?? responseText(workflow, message)} agent={message.agent_name ?? String(message.metadata?.agent ?? "employee_agent")} />;
  }
  if (structuredResponse?.type === "attendance_summary") {
    return (
      <div className="space-y-3">
        <AttendanceSummaryCard summary={(structuredResponse.summary ?? {}) as Record<string, unknown>} />
        <AttendanceTable records={structuredResponse.records ?? []} />
      </div>
    );
  }
  if (structuredResponse?.type === "attendance_table") return <AttendanceTable records={structuredResponse.records ?? []} />;
  if (structuredResponse?.type === "attendance_matrix") {
    const matrix = (structuredResponse.matrix ?? {}) as Record<string, unknown>;
    const summary = (matrix.summary ?? {}) as Record<string, unknown>;
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">Attendance matrix ready</p>
            <p className="mt-1 text-sm text-muted-foreground">{String(matrix.month)}/{String(matrix.year)} · {String((matrix.rows as unknown[])?.length ?? 0)} employee rows</p>
          </div>
          <Button asChild size="sm"><Link to="/attendance">Open Matrix</Link></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <InlineEntityCard title={String(summary.PRESENT ?? 0)} subtitle="Present" agent="attendance_agent" />
          <InlineEntityCard title={String(summary.ABSENT ?? 0)} subtitle="Absent" agent="approval_agent" />
          <InlineEntityCard title={String(summary.WORK_FROM_HOME ?? 0)} subtitle="WFH" agent="notification_agent" />
          <InlineEntityCard title={String(summary.MISSING ?? 0)} subtitle="Missing" agent="payroll_agent" />
        </div>
      </div>
    );
  }
  if (structuredResponse?.type === "attendance_calendar" || structuredResponse?.type === "attendance_detail") {
    return <StatusBannerCard title={structuredResponse.title ?? "Attendance view ready"} summary="Open the Attendance workspace to review and update this record." agent="attendance_agent" />;
  }
  if (structuredResponse?.type === "lop_summary") return <LOPSummaryCard summary={(structuredResponse.summary ?? {}) as Record<string, unknown>} />;
  if (structuredResponse?.type === "leave_balance") return <LeaveBalanceCard balances={structuredResponse.balances ?? []} />;
  if (structuredResponse?.type === "leave_request") {
    return (
      <div className="space-y-3">
        <LeaveRequestCard request={structuredResponse.request ?? {}} />
        {approvalIsOpen(approval, workflow.approval_request_id) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <ShieldCheck className="h-4 w-4" />
              <span>Waiting for an authorized reviewer</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><Link to="/approvals">Review Request</Link></Button>
              <Button asChild size="sm" variant="ghost"><Link to="/leave">Open Leave Workspace</Link></Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  if (structuredResponse?.type === "leave_approval") return <LeaveApprovalCard requests={structuredResponse.requests ?? []} />;
  if (structuredResponse?.type === "leave_history" || structuredResponse?.type === "leave_calendar") {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div>
          <p className="text-base font-semibold">{structuredResponse.title ?? "Leave records"}</p>
          <p className="text-sm text-muted-foreground">{structuredResponse.summary ?? `${structuredResponse.requests?.length ?? 0} leave record(s).`}</p>
        </div>
        <div className="space-y-2">
          {(structuredResponse.requests ?? []).length ? structuredResponse.requests!.map((request, index) => (
            <LeaveRequestCard key={String(request.id ?? index)} request={request} />
          )) : <p className="text-sm text-muted-foreground">No leave records found.</p>}
        </div>
      </div>
    );
  }
  if (structuredResponse?.type === "leave_policy") {
    const policy = structuredResponse.policy ?? {};
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">{String(policy.name ?? "Leave policy")}</p>
            <p className="mt-1 text-sm text-muted-foreground">Leave policy configured for workforce requests.</p>
          </div>
          <StatusBadge status={String(policy.category ?? "PAID")} tone={String(policy.category ?? "").includes("UNPAID") ? "warning" : "success"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <InlineEntityCard title={String(policy.annual_allocation ?? 0)} subtitle="Annual allocation" agent="leave_agent" />
          <InlineEntityCard title={String(policy.requires_approval ? "Required" : "Not required")} subtitle="Approval" agent="approval_agent" />
          <InlineEntityCard title={String(policy.affects_payroll ? "Yes" : "No")} subtitle="Affects payroll" agent="payroll_agent" />
        </div>
      </div>
    );
  }
  if (structuredResponse?.type === "salary_component_card") {
    const component = structuredResponse.component ?? {};
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">{structuredResponse.title ?? "Salary component registered"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{structuredResponse.summary ?? "The payroll component has been created in Agent Command Center."}</p>
          </div>
          <StatusBadge status={component.type ?? "earning"} tone={component.type === "deduction" ? "warning" : "success"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="font-medium">{component.name ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Code</p>
            <p className="font-medium">{component.code ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Calculation</p>
            <p className="font-medium">{component.calculation_type ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Value / formula</p>
            <p className="font-medium">{component.calculation_value ?? component.formula ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Taxable</p>
            <p className="font-medium">{component.taxable ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="font-medium">{component.active ? "Yes" : "No"}</p>
          </div>
        </div>
      </div>
    );
  }
  if (structuredResponse?.type === "salary_component_table") {
    return (
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">{structuredResponse.title ?? "Salary components"}</p>
          <p className="text-sm text-muted-foreground">{structuredResponse.summary ?? "Payroll salary component catalog."}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/70 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Calculation</th>
                <th className="px-4 py-3">Value / formula</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(structuredResponse.components ?? []).map((component, index) => (
                <tr key={component.id ?? index} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">{component.name ?? "-"}</td>
                  <td className="px-4 py-3">{component.code ?? "-"}</td>
                  <td className="px-4 py-3">{component.type ?? "-"}</td>
                  <td className="px-4 py-3">{component.calculation_type ?? "-"}</td>
                  <td className="px-4 py-3">{component.calculation_value ?? component.formula ?? "-"}</td>
                  <td className="px-4 py-3">{component.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (structuredResponse?.type === "salary_structure_card" || structuredResponse?.type === "salary_structure_preview") {
    const items = structuredResponse.items ?? [];
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">{structuredResponse.title ?? "Salary structure"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{structuredResponse.summary ?? "Salary structure details are ready."}</p>
          </div>
          <StatusBadge status={structuredResponse.type === "salary_structure_preview" ? "Preview" : "Saved"} tone={structuredResponse.type === "salary_structure_preview" ? "info" : "success"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Code</p>
            <p className="font-medium">{structuredResponse.structure_code ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Components</p>
            <p className="font-medium">{structuredResponse.component_count ?? items.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Example gross</p>
            <p className="font-medium">{structuredResponse.gross ? `₹${Number(structuredResponse.gross).toLocaleString("en-IN")}` : "₹1,00,000"}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/70 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Component</th>
                <th className="px-3 py-2">Calculation</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((item, index) => (
                <tr key={String(item.component_code ?? index)} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{String(item.component_name ?? item.component_code ?? "-")}</td>
                  <td className="px-3 py-2">{String(item.calculation_type ?? "-")}</td>
                  <td className="px-3 py-2">{String(item.calculation_value ?? item.formula ?? "-")}</td>
                  <td className="px-3 py-2">{String(item.reference_component_code ?? "-")}</td>
                  <td className="px-3 py-2">{item.amount !== undefined ? `₹${Number(item.amount).toLocaleString("en-IN")}` : "-"}</td>
                </tr>
              )) : (
                <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>No components in this structure.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (structuredResponse?.type === "salary_structure_table") {
    return (
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">{structuredResponse.title ?? "Salary Structures"}</p>
          <p className="text-sm text-muted-foreground">Payroll salary structure catalog.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/70 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(structuredResponse.structures ?? []).map((structure, index) => (
              <tr key={String(structure.id ?? index)} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3">{String(structure.name ?? "-")}</td>
                <td className="px-4 py-3">{String(structure.code ?? "-")}</td>
                <td className="px-4 py-3">{String(structure.item_count ?? "-")}</td>
                <td className="px-4 py-3">{structure.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (["salary_preview_card", "salary_revision_card", "salary_breakup_card", "salary_assignment_activated"].includes(structuredResponse?.type ?? "")) {
    const salaryResponse = structuredResponse as StructuredResponse;
    const summary = (salaryResponse.summary ?? {}) as Record<string, unknown>;
    const breakup = (salaryResponse.breakup ?? {}) as Record<string, unknown>;
    const items = (breakup.items ?? []) as Array<Record<string, unknown>>;
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">{String(summary.employee_name ?? "Employee salary")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{String(summary.salary_structure ?? "Salary structure")} · Effective {String(summary.effective_from ?? "Not set")}</p>
          </div>
          <StatusBadge status={String(summary.status ?? (salaryResponse.approval_request_id ? "Pending approval" : "Active"))} tone={salaryResponse.approval_request_id ? "warning" : "success"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-md border p-3"><p className="text-xs uppercase text-muted-foreground">Gross</p><p className="mt-1 font-semibold">{String(summary.gross_salary_display ?? breakup.gross_salary_display ?? "-")}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs uppercase text-muted-foreground">Earnings</p><p className="mt-1 font-semibold">{String(breakup.earnings_display ?? "-")}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs uppercase text-muted-foreground">Deductions</p><p className="mt-1 font-semibold">{String(breakup.deductions_display ?? "-")}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs uppercase text-muted-foreground">Net</p><p className="mt-1 font-semibold">{String(breakup.net_salary_display ?? "-")}</p></div>
        </div>
        {Number(breakup.unallocated_gross ?? 0) !== 0 ? (
          <StatusBannerCard
            title="Structure allocation needs review"
            summary={`${String(breakup.unallocated_gross_display ?? "-")} of gross salary is not allocated to earning components.`}
            agent="payroll_agent"
          />
        ) : null}
        {salaryResponse.approval_request_id ? <StatusBannerCard title="Approval required" summary="This salary change is waiting for approval before activation." agent="approval_agent" /> : null}
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/70 text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">Component</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Calculation</th><th className="px-3 py-2">Amount</th></tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={String(item.component_code ?? index)} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{String(item.component_name ?? item.component_code ?? "-")}</td>
                  <td className="px-3 py-2">{String(item.type ?? "-")}</td>
                  <td className="px-3 py-2">{String(item.calculation_value ?? item.calculation_type ?? "-")}{item.reference_component_code ? ` of ${String(item.reference_component_code)}` : ""}</td>
                  <td className="px-3 py-2">{String(item.amount_display ?? "-")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (structuredResponse?.type === "salary_history_card") {
    const history = structuredResponse.history ?? [];
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <p className="text-base font-semibold">{structuredResponse.title ?? "Salary history"}</p>
        {history.length ? history.map((row, index) => (
          <div key={String(row.id ?? index)} className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{String(row.revision_type ?? "Revision")}</span>
              <span className="text-muted-foreground">{String(row.effective_from ?? "")}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{String(row.old_salary ?? "New")} → {String(row.new_salary ?? "-")}</p>
          </div>
        )) : <p className="text-sm text-muted-foreground">No salary revisions found.</p>}
      </div>
    );
  }
  if (structuredResponse?.type === "salary_assignment_table") {
    const assignments = structuredResponse.assignments ?? [];
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <p className="text-base font-semibold">{structuredResponse.title ?? "Salary assignments"}</p>
        {assignments.length ? assignments.map((row, index) => (
          <div key={String(row.id ?? index)} className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{String(row.employee_name ?? "Employee")}</span>
              <StatusBadge status={String(row.status ?? "Pending")} tone="warning" />
            </div>
            <p className="mt-1 text-muted-foreground">{String(row.salary_structure ?? "Structure")} · {String(row.gross_salary_display ?? "-")}</p>
          </div>
        )) : <p className="text-sm text-muted-foreground">No pending salary approvals.</p>}
      </div>
    );
  }

  if (approvalIsOpen(approval, workflow.approval_request_id) && (commandLower.includes("salary") || String(message.metadata?.action) === "change_salary")) {
    return <ApprovalDiffCard currentSalary="Not available" newSalary={salaryFromCommand(command) ?? "Not available"} status={approvalDisplayStatus(approval)} />;
  }
  if (workflow.approval_request_id && activeAgent.includes("payroll")) return <PayrollSummaryCard />;
  if (activeAgent.includes("payroll") || commandLower.includes("payroll")) return <PayrollSummaryCard />;
  if (activeAgent.includes("leave") || commandLower.includes("leave")) return <LeaveSummaryCard />;
  if (commandLower.includes("show employee") && !commandLower.includes("list") && employeeNameFromCommand(command)) return <EmployeePreviewCard name={employeeNameFromCommand(command) ?? undefined} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{friendlyStatus(workflow.status) === "Completed" ? "Done" : String(message.metadata?.operation_summary ?? "Request handled")}</p>
        <StatusBadge status={friendlyStatus(workflow.status)} tone={statusTone(workflow.status)} />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{responseText(workflow, message)}</p>
    </div>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="inline-flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      </span>
      {label}
    </div>
  );
}

function InlineProgress({ events, status }: { events: RuntimeEvent[]; status: string }) {
  const steps = events.length ? events.map((event) => ({ id: event.id, label: friendlyEvent(event), agentName: event.agent_name })) : [{ id: "created", label: "Request received", agentName: "coordinator_agent" }];
  const uniqueSteps = steps.filter((step, index, list) => list.findIndex((item) => item.label === step.label) === index).slice(0, 5);
  const finalSteps = status === "COMPLETED" && !uniqueSteps.some((step) => step.label === "Completed") ? [...uniqueSteps, { id: "completed", label: "Completed", agentName: "coordinator_agent" }] : uniqueSteps;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-full border bg-slate-50/80 px-3 py-2 text-xs text-muted-foreground shadow-sm dark:bg-zinc-900/60">
      {finalSteps.map((step, index) => {
        const theme = agentThemeFor(step.agentName);
        return (
          <div key={`${step.id}-${step.label}`} className="flex items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 font-medium", theme.tint, theme.border, theme.text)}>{step.label}</span>
            {index < finalSteps.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function SuggestedActions({ onSelect, disabled }: { onSelect: (value: string) => void; disabled?: boolean }) {
  const theme = agentThemeFor("coordinator_agent");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl border shadow-sm", theme.icon)}>
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="mt-5 text-xl font-semibold">What would you like the AI workforce to handle?</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Start with an HR operation. Approvals and workflow progress will appear inline as the request moves forward.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {suggestedActions.map((action) => (
          <Button key={action} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSelect(action)}>
            {action}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function AgentCommandPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const isDebugMode = Boolean(currentUser?.is_superuser);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [commandDraft, setCommandDraft] = useState<string | undefined>(undefined);
  const [uploadedCandidate, setUploadedCandidate] = useState<CandidateCardData | null>(null);
  const [uploadedCommand, setUploadedCommand] = useState<string | null>(null);
  const [completedWorkflowId, setCompletedWorkflowId] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; description?: string; type?: "success" | "info" | "error" } | null>(null);

  const workflowsQuery = useQuery({ queryKey: ["agent-command-workflows"], queryFn: getWorkflows, refetchInterval: 10000 });
  const workflows = useMemo(() => (workflowsQuery.data ?? []).slice(0, 30), [workflowsQuery.data]);
  const selectedFromList = selectedWorkflowId ?? workflows[0]?.workflow_id ?? null;

  const workflowQuery = useQuery({
    queryKey: ["agent-command-workflow", selectedFromList],
    queryFn: () => getWorkflow(selectedFromList!),
    enabled: Boolean(selectedFromList),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "RUNNING" || data?.status === "WAITING_APPROVAL" ? 6000 : false;
    },
  });
  useEffect(() => {
    if (!selectedWorkflowId && workflows[0]?.workflow_id) setSelectedWorkflowId(workflows[0].workflow_id);
  }, [selectedWorkflowId, workflows]);

  const commandMutation = useMutation({
    mutationFn: submitAgentCommand,
    onMutate: (command) => {
      setSendError(null);
      setPendingCommand(command);
    },
    onSuccess: async (workflow) => {
      setSelectedWorkflowId(workflow.workflow_id);
      await queryClient.invalidateQueries({ queryKey: ["agent-command-workflows"] });
      await queryClient.invalidateQueries({ queryKey: ["agent-command-workflow", workflow.workflow_id] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["onboarding-workflows"] });
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["payroll-components"] });
      await queryClient.invalidateQueries({ queryKey: ["payroll-structures"] });
      setPendingCommand(null);
    },
    onError: (error, command) => {
      setPendingCommand(null);
      setCommandDraft(command);
      setSendError(error instanceof Error ? error.message : "Unable to send command");
    },
  });

  async function handleResumeUpload(file: File) {
    try {
      setUploadingResume(true);
      setUploadProgress(0);
      setUploadedCandidate(null);
      setSendError(null);
      const response = await uploadOnboardingResume(file, setUploadProgress);
      setUploadedCandidate(response.candidate as CandidateCardData);
      setUploadedCommand(response.suggested_command);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to upload resume");
    } finally {
      setUploadingResume(false);
      setUploadProgress(null);
    }
  }

  const activeWorkflow = workflowQuery.data ?? workflows.find((workflow) => workflow.workflow_id === selectedFromList) ?? null;
  const activeApprovalId = activeWorkflow?.approval_request_id ?? null;
  const activeApprovalQuery = useQuery({
    queryKey: ["approvals", activeApprovalId],
    queryFn: () => getApproval(activeApprovalId!),
    enabled: Boolean(activeApprovalId),
    refetchInterval: (query) => {
      const approval = query.state.data;
      if (!approval) return 5000;
      return approvalIsOpen(approval, activeApprovalId) ? 5000 : false;
    },
  });
  const activeApproval = activeApprovalQuery.data ?? null;
  const onboardingDebugQuery = useQuery({
    queryKey: ["onboarding-state-debug", selectedFromList],
    queryFn: () => getOnboardingStateDebug(selectedFromList!),
    enabled: Boolean(isDebugMode && detailsOpen && selectedFromList && activeWorkflow?.active_agent?.includes("onboarding")),
  });
  const messages = activeWorkflow?.messages ?? [];
  const conversationWorkflows = useMemo(() => {
    const byId = new Map<string, AgentCommandWorkflow>();
    workflows.forEach((workflow) => byId.set(workflow.workflow_id, workflow));
    if (activeWorkflow) byId.set(activeWorkflow.workflow_id, activeWorkflow);
    return Array.from(byId.values())
      .sort((left, right) => timestampValue(left.started_at) - timestampValue(right.started_at));
  }, [activeWorkflow, workflows]);
  const conversationMessages = useMemo(() => conversationWorkflows.flatMap((workflow) => (
    visibleMessagesForWorkflow(workflow).map((message) => ({ workflow, message }))
  )), [conversationWorkflows]);
  const timelineEvents = activeWorkflow?.timeline_events ?? [];
  const hasConversation = Boolean(activeWorkflow || commandMutation.isPending);
  const hasInlineLeaveApproval = messages.some((message) => {
    const response = message.metadata?.structured_response as StructuredResponse | undefined;
    return response?.type === "leave_request" && Boolean(response.approval_request_id ?? activeWorkflow?.approval_request_id);
  });
  const showActiveApproval = Boolean(
    activeWorkflow
    && approvalIsOpen(activeApproval, activeWorkflow.approval_request_id)
    && !hasInlineLeaveApproval,
  );

  useEffect(() => {
    const state = location.state as { draftCommand?: string } | null;
    if (!state?.draftCommand) return;
    setCommandDraft(state.draftCommand);
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!activeWorkflow || activeWorkflow.status !== "COMPLETED" || completedWorkflowId === activeWorkflow.workflow_id) return;
    setCompletedWorkflowId(activeWorkflow.workflow_id);
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
    void queryClient.invalidateQueries({ queryKey: ["employee-salary"] });
    void queryClient.invalidateQueries({ queryKey: ["employee-payroll-impact"] });
    void queryClient.invalidateQueries({ queryKey: ["onboarding-workflows"] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-components"] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-structures"] });
    if (activeWorkflow.active_agent?.includes("onboarding") || activeWorkflow.active_agent?.includes("employee")) {
      setToast({
        title: "HR workspace updated",
        description: activeWorkflow.active_agent?.includes("onboarding") ? "The employee list and onboarding workspace have refreshed." : "Employee records have refreshed.",
        type: "success",
      });
    }
  }, [activeWorkflow, completedWorkflowId, queryClient]);

  useEffect(() => {
    if (!activeWorkflow || !approvalIsCompleted(activeApproval)) return;
    void queryClient.invalidateQueries({ queryKey: ["agent-command-workflows"] });
    void queryClient.invalidateQueries({ queryKey: ["agent-command-workflow", activeWorkflow.workflow_id] });
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
    void queryClient.invalidateQueries({ queryKey: ["employee-salary"] });
    void queryClient.invalidateQueries({ queryKey: ["employee-leave-balances"] });
    void queryClient.invalidateQueries({ queryKey: ["employee-leave-history"] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-components"] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-structures"] });
  }, [activeApproval, activeWorkflow, queryClient]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  return (
    <AppLayout>
      <PageContainer className="max-w-[1180px] gap-4">
        <PageHeader
          title="Agent Command Center"
          description="A focused AI workspace for HR requests, approvals, and employee operations."
          actions={
            isDebugMode && (activeWorkflow || workflows.length) ? (
              <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" />
                Admin Details
              </Button>
            ) : null
          }
        />

        <main className="flex min-h-[calc(100vh-220px)] flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto py-8">
            {workflowQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
            {!hasConversation && !workflowQuery.isLoading ? <SuggestedActions onSelect={(value) => commandMutation.mutate(value)} disabled={commandMutation.isPending} /> : null}

            {uploadedCandidate && !commandMutation.isPending ? (
              <AgentMessageBubble time="Now" name="Resume Parser Agent" agentName="resume_parser_agent">
                <CandidateCard
                  candidate={uploadedCandidate}
                  onStartOnboarding={() => {
                    if (uploadedCommand) {
                      commandMutation.mutate(uploadedCommand);
                      setUploadedCandidate(null);
                    }
                  }}
                />
              </AgentMessageBubble>
            ) : null}

            {isDebugMode && activeWorkflow ? <InlineProgress events={timelineEvents} status={activeWorkflow.status} /> : null}

            {conversationMessages.map(({ workflow, message }) => {
              if (message.type === "user_message") {
                return (
                  <UserMessageBubble key={`${workflow.workflow_id}-${message.id}`} time={formatTime(message.created_at)}>
                    {message.content}
                  </UserMessageBubble>
                );
              }
              const messageAgent = message.agent_name ?? String(message.metadata?.agent ?? workflow.active_agent ?? "");
              const messageApproval = workflow.workflow_id === activeWorkflow?.workflow_id ? activeApproval : null;
              return (
                <AgentMessageBubble
                  key={`${workflow.workflow_id}-${message.id}`}
                  time={formatTime(message.created_at)}
                  name={String(message.metadata?.agent_display_name ?? agentLabel(message.agent_name))}
                  agentName={messageAgent}
                  meta={<StatusBadge status={friendlyStatus(workflow.status)} tone={statusTone(workflow.status)} />}
                >
                  <BusinessResponse workflow={workflow} message={message} onSend={(value) => commandMutation.mutate(value)} onDraftCommand={setCommandDraft} approval={messageApproval} />
                </AgentMessageBubble>
              );
            })}

            {pendingCommand ? (
              <UserMessageBubble time="Sending">
                {pendingCommand}
              </UserMessageBubble>
            ) : null}

            {commandMutation.isPending || uploadingResume ? (
              <AgentMessageBubble time="Working" name="HR Assistant" agentName="coordinator_agent">
                <TypingIndicator label={uploadingResume ? `Reading resume${uploadProgress !== null ? ` (${uploadProgress}%)` : ""}...` : "Working on it..."} />
              </AgentMessageBubble>
            ) : null}

            {activeWorkflow?.status === "FAILED" && messages.length <= 1 ? (
              <AgentMessageBubble time={formatTime(activeWorkflow.completed_at ?? activeWorkflow.started_at)} name={agentLabel(activeWorkflow.active_agent)} agentName={activeWorkflow.active_agent ?? "coordinator_agent"} meta={<StatusBadge status="Needs review" tone="danger" />}>
                <StatusBannerCard
                  title={String(((activeWorkflow.result?.structured_response as Record<string, unknown> | undefined)?.title) ?? "Request could not be completed")}
                  summary={String(((activeWorkflow.result?.structured_response as Record<string, unknown> | undefined)?.summary) ?? activeWorkflow.result?.error ?? "The workflow failed before an agent response was created.")}
                  agent={activeWorkflow.active_agent ?? "coordinator_agent"}
                />
              </AgentMessageBubble>
            ) : null}

            {showActiveApproval && activeWorkflow ? (
              <AgentMessageBubble time={formatTime(activeWorkflow.started_at)} name={agentLabel(activeWorkflow.active_agent)} agentName="approval_agent" meta={<StatusBadge status="Approval needed" tone="warning" />}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={cn("h-4 w-4", agentThemeFor("approval_agent").text)} />
                    <span className="font-medium">Human approval is required</span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">This request includes a sensitive action. Review it in the Approval Inbox before the workflow continues.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm"><Link to="/approvals">Approve</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link to="/approvals">Reject</Link></Button>
                    <Button asChild size="sm" variant="ghost"><Link to="/approvals">View Approval</Link></Button>
                  </div>
                </div>
              </AgentMessageBubble>
            ) : null}
          </div>

          <div className="sticky bottom-0 border-t bg-background/95 py-4 backdrop-blur">
            <CommandInput placeholder="Ask for an HR operation. Enter sends, Shift+Enter adds a line." onSend={(value) => commandMutation.mutate(value)} onAttach={handleResumeUpload} loading={commandMutation.isPending || uploadingResume} disabled={commandMutation.isPending || uploadingResume} error={sendError} draftValue={commandDraft} onDraftConsumed={() => setCommandDraft(undefined)} />
          </div>
        </main>

        {toast ? (
          <div className="fixed bottom-6 right-6 z-50 animate-in fade-in-50 slide-in-from-bottom-2">
            <ToastNotification title={toast.title} description={toast.description} type={toast.type} />
          </div>
        ) : null}

        {isDebugMode ? <DrawerPanel open={detailsOpen} title="Admin Workflow Details" size="2xl" onClose={() => setDetailsOpen(false)}>
          <div className="space-y-6">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Workflow history</p>
              <div className="mt-3 space-y-2">
                {workflows.length ? (
                  workflows.map((workflow) => {
                    const theme = agentThemeFor(workflow.active_agent);
                    return (
                      <button key={workflow.workflow_id} type="button" onClick={() => { setSelectedWorkflowId(workflow.workflow_id); setDetailsOpen(false); }} className={cn("w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/60", theme.soft)}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-medium">{commandFromWorkflow(workflow)}</p>
                          <StatusBadge status={friendlyStatus(workflow.status)} tone={statusTone(workflow.status)} />
                        </div>
                        <p className={cn("mt-2 text-xs", theme.text)}>{agentLabel(workflow.active_agent)}</p>
                      </button>
                    );
                  })
                ) : (
                  <EmptyState icon={Bot} title="No workflows yet" description="Send a command to begin." />
                )}
              </div>
            </div>

            {activeWorkflow ? (
              <>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Current request</p>
                  <p className="mt-2 text-sm leading-6">{commandFromWorkflow(activeWorkflow)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Execution details</p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge status={friendlyStatus(activeWorkflow.status)} tone={statusTone(activeWorkflow.status)} />
                    <span className={cn("text-sm", agentThemeFor(activeWorkflow.active_agent).text)}>{agentLabel(activeWorkflow.active_agent)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Timeline</p>
                  <div className="mt-3 space-y-3">
                    {timelineEvents.length ? (
                      timelineEvents.map((event) => {
                        const theme = agentThemeFor(event.agent_name);
                        return (
                          <div key={event.id} className={cn("rounded-md border p-3", theme.soft)}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{friendlyEvent(event)}</p>
                              <span className="text-xs text-muted-foreground">{formatTime(event.created_at)}</span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{friendlyDescription(event)}</p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">No workflow details yet.</p>
                    )}
                  </div>
                </div>
                {activeWorkflow.active_agent?.includes("onboarding") ? (
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Onboarding State</p>
                    {onboardingDebugQuery.isLoading ? <LoadingSkeleton rows={3} /> : null}
                    {onboardingDebugQuery.data ? (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-md border bg-muted/30 p-3">
                          <p className="text-sm font-medium">Current collected details</p>
                          <pre className="mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify(onboardingDebugQuery.data.onboarding_state, null, 2)}</pre>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-3">
                          <p className="text-sm font-medium">Extraction log</p>
                          <pre className="mt-2 max-h-72 overflow-auto text-xs">{JSON.stringify(onboardingDebugQuery.data.debug, null, 2)}</pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </DrawerPanel> : null}
      </PageContainer>
    </AppLayout>
  );
}
