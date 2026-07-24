import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, BadgeDollarSign, Ban, BriefcaseBusiness, Building2, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, FileCheck2, Flag, Home, Landmark, Laptop, Mail, ShieldCheck, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui-system/DrawerPanel";
import { StatusBadge } from "@/components/ui-system/StatusBadge";
import { agentThemeFor, statusToneFor } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";
import { createSalaryAssignment, getEmployeePayrollImpact, getEmployeeSalary, getSalaryStructures } from "@/services/salaryAssignments";
import { getEmployeeAttendanceSummary } from "@/services/attendance";
import { getEmployeeLeaveBalances, getEmployeeLeaveHistory } from "@/services/leave";
import { getDocuments } from "@/services/documents";
import { getAssets, type AssetRecord } from "@/services/assets";
import { useAuthStore } from "@/stores/authStore";

import { useRef } from "react";
import { Upload } from "lucide-react";
import { createDocument } from "@/services/documents";
import { getLookups } from "@/services/lookups";

export type EmployeeCardData = {
  id?: string | null;
  employee_code?: string | null;
  name?: string | null;
  designation?: string | null;
  department?: string | null;
  manager?: string | null;
  status?: string | null;
  employment_type?: string | null;
  joining_date?: string | null;
  official_email?: string | null;
  salary?: string | null;
  current_salary?: number | null;
  personal_email?: string | null;
  phone?: string | null;
  dob?: string | null;
  gender?: string | null;
  bank_account_number?: string | null;
  ifsc_code?: string | null;
  pan_number?: string | null;
  aadhaar_number?: string | null;
  uan_number?: string | null;
};

export type CandidateCardData = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  skills?: string[];
  experience?: string | null;
  education?: string | null;
  current_company?: string | null;
  designation?: string | null;
  department?: string | null;
  manager?: string | null;
  joining_date?: string | null;
  salary?: string | null;
  employment_type?: string | null;
  location?: string | null;
  shift?: string | null;
  field_sources?: Record<string, string>;
};

export function WorkflowStatusPill({ status, agent }: { status: string; agent?: string | null }) {
  const theme = agentThemeFor(agent);
  return <StatusBadge status={status} tone={statusToneFor(status)} className={cn(agent && theme.border, agent && theme.tint, agent && theme.text)} />;
}

function formatSalary(value?: string | null) {
  if (!value) return "Not provided";
  const amount = Number(String(value).replace(/[^\d]/g, ""));
  return amount ? `₹${amount.toLocaleString("en-IN")}` : value;
}

function sourceLabel(source?: string, value?: unknown) {
  if (!value) return "Missing";
  if (source === "resume") return "Resume Extracted";
  if (source === "employee_master") return "Verified";
  if (source === "ai_inferred") return "Needs Confirmation";
  if (source === "user_input") return "User Provided";
  return "User Provided";
}

function sourceTone(source?: string, value?: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  if (!value) return "neutral";
  if (source === "ai_inferred") return "warning";
  if (source === "employee_master") return "success";
  if (source === "resume") return "info";
  return "success";
}

export function EmployeeStatusBadge({ status = "Active" }: { status?: string | null }) {
  const normalized = (status ?? "Active").replace("_", " ");
  return <StatusBadge status={normalized} tone={statusToneFor(normalized)} />;
}

export function EntityActionBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 border-t pt-4">{children}</div>;
}

export function EmployeeQuickActions({
  employeeId,
  onUpdate,
  onDeactivate,
}: {
  employeeId?: string | null;
  onUpdate?: () => void;
  onDeactivate?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <EntityActionBar>
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={() => employeeId && navigate(`/employees/${employeeId}`)}
        disabled={!employeeId}
      >
        View Profile
      </Button>
      <Button size="sm" type="button" onClick={onUpdate} disabled={!onUpdate}>Update</Button>
      <Button size="sm" type="button" variant="ghost" onClick={onDeactivate} disabled={!onDeactivate}>Deactivate</Button>
    </EntityActionBar>
  );
}

export function InlineEntityCard({
  title,
  subtitle,
  meta,
  icon,
  agent = "employee_agent",
}: {
  title: string;
  subtitle: string;
  meta?: string;
  icon?: ReactNode;
  agent?: string | null;
}) {
  const theme = agentThemeFor(agent);
  return (
    <div className={cn("flex items-center gap-3 rounded-md border p-3", theme.soft)}>
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-md border", theme.icon)}>
        {icon ?? <UserRound className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {meta ? <span className="text-xs font-medium text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

export function ApprovalBanner({
  title = "Approval required",
  description,
}: {
  title?: string;
  description: string;
}) {
  const theme = agentThemeFor("approval_agent");
  return (
    <div className={cn("rounded-md border p-3", theme.tint, theme.border, theme.text)}>
      <div className="flex gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6 opacity-85">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function StatusBannerCard({ title, summary, agent = "employee_agent" }: { title: string; summary: string; agent?: string | null }) {
  const theme = agentThemeFor(agent);
  return (
    <div className={cn("rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", theme.icon)}>
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{summary}</p>
        </div>
      </div>
    </div>
  );
}

export function CandidateCard({ candidate, onStartOnboarding, showActions = true }: { candidate: CandidateCardData; onStartOnboarding?: () => void; showActions?: boolean }) {
  const theme = agentThemeFor("candidate_agent");
  return (
    <div className={cn("space-y-3 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-md border", theme.icon)}>
            <UserRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold">{candidate.name ?? "Candidate"}</h3>
            <p className="text-sm text-muted-foreground">{candidate.email ?? candidate.phone ?? "Candidate profile"}</p>
          </div>
        </div>
        <WorkflowStatusPill status={candidate.status ?? "SCREENING"} agent="candidate_agent" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <InfoCell label="Experience" value={candidate.experience ?? "Not available"} icon={<BriefcaseBusiness className="h-4 w-4" />} agent="candidate_agent" />
        <InfoCell label="Education" value={candidate.education ?? "Not available"} icon={<FileCheck2 className="h-4 w-4" />} agent="document_agent" />
      </div>
      {candidate.skills?.length ? <p className="text-sm text-muted-foreground">Skills: {candidate.skills.join(", ")}</p> : null}
      {showActions ? (
        <EntityActionBar>
          <Button size="sm" type="button" onClick={onStartOnboarding} disabled={!onStartOnboarding} className="cursor-pointer shadow-sm">
            Start Onboarding
          </Button>
          <Button size="sm" type="button" variant="outline">Edit Candidate</Button>
          <Button size="sm" type="button" variant="ghost">Reject Candidate</Button>
        </EntityActionBar>
      ) : null}
    </div>
  );
}

export function MissingFieldCard({
  title = "A few details are needed",
  summary,
  labels,
  draft,
}: {
  title?: string;
  summary?: string;
  labels: string[];
  draft?: CandidateCardData;
}) {
  const theme = agentThemeFor("onboarding_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{summary ?? "Reply with only the missing information. I will keep the current onboarding context."}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {labels.map((label) => (
          <div key={label} className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-800">
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OnboardingSummaryCard({
  candidate,
  status = "Ready",
  onStartOnboarding,
}: {
  candidate: CandidateCardData;
  status?: string;
  onStartOnboarding?: () => void;
}) {
  const theme = agentThemeFor("onboarding_agent");
  const sources = candidate.field_sources ?? {};
  const Field = ({ label, value, field, icon, agent }: { label: string; value: string | null; field: string; icon: ReactNode; agent: string }) => (
    <div className="space-y-2">
      <InfoCell label={label} value={value ?? "Missing"} icon={icon} agent={agent} />
      <StatusBadge status={sourceLabel(sources[field], value)} tone={sourceTone(sources[field], value)} />
    </div>
  );
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Onboarding summary</h3>
          <p className="mt-1 text-sm text-muted-foreground">Review the collected details before starting onboarding.</p>
        </div>
        <WorkflowStatusPill status={status} agent="onboarding_agent" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Employee" field="name" value={candidate.name ?? null} icon={<UserRound className="h-4 w-4" />} agent="candidate_agent" />
        <Field label="Designation" field="designation" value={candidate.designation ?? null} icon={<BriefcaseBusiness className="h-4 w-4" />} agent="employee_agent" />
        <Field label="Department" field="department" value={candidate.department ?? null} icon={<Building2 className="h-4 w-4" />} agent="employee_agent" />
        <Field label="Manager" field="manager" value={candidate.manager ?? null} icon={<ShieldCheck className="h-4 w-4" />} agent="approval_agent" />
        <Field label="Joining Date" field="joining_date" value={candidate.joining_date ?? null} icon={<CheckCircle2 className="h-4 w-4" />} agent="employee_agent" />
        <Field label="Salary" field="salary" value={candidate.salary ? formatSalary(candidate.salary) : null} icon={<BadgeDollarSign className="h-4 w-4" />} agent="payroll_agent" />
        <Field label="Employment Type" field="employment_type" value={candidate.employment_type ?? null} icon={<FileCheck2 className="h-4 w-4" />} agent="document_agent" />
        <Field label="Location" field="location" value={candidate.location ?? null} icon={<Building2 className="h-4 w-4" />} agent="notification_agent" />
        <Field label="Shift" field="shift" value={candidate.shift ?? null} icon={<FileCheck2 className="h-4 w-4" />} agent="attendance_agent" />
      </div>
      {onStartOnboarding ? (
        <EntityActionBar>
          <Button size="sm" type="button" onClick={onStartOnboarding}>Start Onboarding</Button>
          <Button size="sm" type="button" variant="outline">Edit Details</Button>
        </EntityActionBar>
      ) : null}
    </div>
  );
}

export function ConversationalApprovalCard({ summary }: { summary: string }) {
  return <ApprovalBanner title="Approval will be requested" description={summary} />;
}

export function InlineEntityEditor({ candidate }: { candidate: CandidateCardData }) {
  return <OnboardingSummaryCard candidate={candidate} status="Editing" />;
}

export function DocumentChecklistCard({ documents }: { documents: Array<{ name: string; status: string }> }) {
  return <ChecklistCard title="Document Checklist" icon={<FileCheck2 className="h-4 w-4" />} agent="document_agent" items={documents} />;
}

export function AssetAllocationCard({ assets }: { assets: Array<{ name: string; status: string }> }) {
  return <ChecklistCard title="Asset Allocation" icon={<Laptop className="h-4 w-4" />} agent="asset_agent" items={assets} />;
}

export function OfferLetterPreviewCard({ candidate }: { candidate: CandidateCardData }) {
  const theme = agentThemeFor("document_agent");
  return (
    <div className={cn("rounded-lg border p-4 shadow-sm", theme.soft)}>
      <p className={cn("text-xs font-medium uppercase", theme.text)}>Offer Letter Preview</p>
      <h3 className="mt-2 text-base font-semibold">{candidate.name ?? "Candidate"}</h3>
      <p className="mt-1 text-sm text-muted-foreground">Draft offer package will be generated after onboarding approval.</p>
    </div>
  );
}

export function OnboardingProgressCard({
  title,
  summary,
  candidate,
  steps,
  documents,
  assets,
}: {
  title: string;
  summary: string;
  candidate: CandidateCardData;
  steps: Array<{ agent: string; title: string; status: string; summary: string }>;
  documents: Array<{ name: string; status: string }>;
  assets: Array<{ name: string; status: string }>;
}) {
  const theme = agentThemeFor("onboarding_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
      </div>
      <CandidateCard candidate={candidate} showActions={false} />
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch gap-2">
        {steps.map((step) => {
          const stepTheme = agentThemeFor(step.agent);
          return (
            <div key={`${step.agent}-${step.title}`} className={cn("w-44 shrink-0 rounded-md border p-3", stepTheme.soft)}>
              <div className="flex items-center gap-2">
                <div className={cn("h-2.5 w-2.5 rounded-full border", stepTheme.tint, stepTheme.border)} />
                <p className="truncate text-sm font-medium">{step.title}</p>
              </div>
              <div className="mt-2">
                <WorkflowStatusPill status={step.status} agent={step.agent} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{step.summary}</p>
            </div>
          );
        })}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <DocumentChecklistCard documents={documents} />
        <AssetAllocationCard assets={assets} />
      </div>
      <OfferLetterPreviewCard candidate={candidate} />
    </div>
  );
}

export function OnboardingProgressChecklistCard({
  title,
  summary,
  employee,
  percent,
  items,
}: {
  title: string;
  summary: string;
  employee?: EmployeeCardData | null;
  percent: number;
  items: Array<{ key: string; label: string; complete: boolean; tab?: string }>;
}) {
  const theme = agentThemeFor("onboarding_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold", theme.tint, theme.border, theme.text)}>
          {percent}%
        </div>
      </div>
      {employee?.name ? (
        <InlineEntityCard
          title={employee.name}
          subtitle={employee.designation ?? "Employee"}
          meta={employee.department ?? undefined}
          agent="employee_agent"
        />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span>{item.label}</span>
            <StatusBadge status={item.complete ? "Complete" : "Pending"} tone={item.complete ? "success" : "warning"} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActionCard({
  title,
  summary,
  actions = ["Send For Approval", "Edit Request"],
  onAction,
  confirmation = false,
}: {
  title: string;
  summary: string;
  actions?: string[];
  onAction?: (action: string) => void;
  confirmation?: boolean;
}) {
  const theme = agentThemeFor(confirmation ? "employee_agent" : "approval_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{summary}</p>
        </div>
        <WorkflowStatusPill status={confirmation ? "Confirmation Needed" : "Approval Required"} agent={confirmation ? "employee_agent" : "approval_agent"} />
      </div>
      {confirmation ? (
        <p className="text-sm text-muted-foreground">Review the change and confirm whether it should be applied.</p>
      ) : (
        <ApprovalBanner description="This action is governed and will remain paused until an authorized approver reviews it." />
      )}
      <EntityActionBar>
        {actions.map((action, index) => (
          <Button key={action} size="sm" variant={index === 0 ? "default" : "outline"} onClick={() => onAction?.(action)}>
            {action}
          </Button>
        ))}
      </EntityActionBar>
    </div>
  );
}

export function EmployeePreviewCard({
  employee,
  name,
  status = "Active",
  department,
  manager,
  designation,
  joiningDate,
  salary,
  onUpdate,
  onDeactivate,
  showActions = true,
}: {
  employee?: EmployeeCardData | null;
  name?: string;
  status?: string;
  department?: string;
  manager?: string;
  designation?: string;
  joiningDate?: string | null;
  salary?: string | null;
  onUpdate?: (employee: EmployeeCardData) => void;
  onDeactivate?: (employee: EmployeeCardData) => void;
  showActions?: boolean;
}) {
  const theme = agentThemeFor("employee_agent");
  const record = {
    name: employee?.name ?? name,
    status: employee?.status ?? status,
    department: employee?.department ?? department,
    manager: employee?.manager ?? manager,
    designation: employee?.designation ?? designation,
    joiningDate: employee?.joining_date ?? joiningDate,
    salary: employee?.salary ?? salary,
    officialEmail: employee?.official_email,
  };

  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-md border", theme.icon)}>
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">{record.name}</h3>
            <p className="text-sm text-muted-foreground">{record.designation ?? "Employee profile preview"}</p>
          </div>
        </div>
        <EmployeeStatusBadge status={record.status} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoCell label="Department" value={record.department ?? "Unassigned"} icon={<Building2 className="h-4 w-4" />} agent="employee_agent" />
        <InfoCell label="Manager" value={record.manager ?? "Unassigned"} icon={<BriefcaseBusiness className="h-4 w-4" />} agent="employee_agent" />
        <InfoCell label="Salary" value={record.salary ?? "Not available"} icon={<BadgeDollarSign className="h-4 w-4" />} agent="payroll_agent" />
        <InfoCell label="Joining Date" value={record.joiningDate ?? "Not available"} icon={<CheckCircle2 className="h-4 w-4" />} agent="employee_agent" />
      </div>
      {record.officialEmail ? <InlineEntityCard title={record.officialEmail} subtitle="Official email" icon={<Mail className="h-4 w-4" />} agent="notification_agent" /> : null}
      {showActions ? (
        <EmployeeQuickActions
          employeeId={employee?.id ?? undefined}
          onUpdate={onUpdate ? () => onUpdate(employee ?? record) : undefined}
          onDeactivate={onDeactivate ? () => onDeactivate(employee ?? record) : undefined}
        />
      ) : null}
    </div>
  );
}

function EmployeePersonalDetailsCard({ employee }: { employee: EmployeeCardData | null }) {
  if (!employee) return null;
  const theme = agentThemeFor("employee_agent");
  const fields: Array<[string, string | null | undefined]> = [
    ["Personal Email", employee.personal_email],
    ["Phone", employee.phone],
    ["Date of Birth", employee.dob],
    ["Gender", employee.gender],
    ["Bank Account", employee.bank_account_number],
    ["IFSC Code", employee.ifsc_code],
    ["PAN Number", employee.pan_number],
    ["Aadhaar Number", employee.aadhaar_number],
    ["UAN Number", employee.uan_number],
  ];
  const populated = fields.filter(([, value]) => Boolean(value));
  if (!populated.length) {
    return <p className="rounded-lg border p-4 text-sm text-muted-foreground">No additional personal details on file yet.</p>;
  }
  return (
    <div className={cn("rounded-lg border p-4", theme.soft)}>
      <p className="text-sm font-semibold">Personal &amp; Payroll-Readiness Details</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {populated.map(([label, value]) => (
          <InfoCell key={label} label={label} value={value as string} icon={<UserRound className="h-4 w-4" />} agent="employee_agent" />
        ))}
      </div>
    </div>
  );
}

export function EmployeeTableCard({ employees, summary }: { employees: EmployeeCardData[]; summary?: string }) {
  const theme = agentThemeFor("employee_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div>
        <h3 className="text-base font-semibold">Employee Results</h3>
        <p className="mt-1 text-sm text-muted-foreground">{summary ?? `${employees.length} employee record(s) found.`}</p>
      </div>
      <div className="overflow-hidden rounded-md border bg-background/70">
        <table className="w-full text-left text-sm">
          <thead className={cn("text-xs uppercase", theme.tint, theme.text)}>
            <tr>
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Manager</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.length ? (
              employees.map((employee, index) => (
                <tr key={employee.id ?? `${employee.name}-${index}`} className="border-t">
                  <td className="px-3 py-3">
                    <p className="font-medium">{employee.name ?? "Unnamed employee"}</p>
                    <p className="text-xs text-muted-foreground">{employee.designation ?? employee.official_email ?? employee.employee_code}</p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{employee.department ?? "Unassigned"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{employee.manager ?? "Unassigned"}</td>
                  <td className="px-3 py-3"><EmployeeStatusBadge status={employee.status} /></td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>No matching employees found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmployeeProfileDrawer({
  open,
  employee,
  onClose,
  onUpdate,
  onDeactivate,
  initialTab = "Personal",
  attendanceMonth,
  attendanceYear,
  extraHeader,
  activeTab,
  onTabChange,
}: {
  open: boolean;
  employee: EmployeeCardData | null;
  onClose: () => void;
  onUpdate?: (employee: EmployeeCardData) => void;
  onDeactivate?: (employee: EmployeeCardData) => void;
  initialTab?: string;
  attendanceMonth?: number;
  attendanceYear?: number;
  extraHeader?: ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const [internalTab, setInternalTab] = useState(initialTab);
  const tab = activeTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const canViewPayroll = useAuthStore((state) => state.hasPermission("payroll:view"));
  const today = new Date();
  const [attendancePeriod, setAttendancePeriod] = useState({
    month: attendanceMonth ?? today.getMonth() + 1,
    year: attendanceYear ?? today.getFullYear(),
  });
  const month = attendancePeriod.month;
  const year = attendancePeriod.year;
  useEffect(() => {
    if (!open) return;
    const currentDate = new Date();
    setAttendancePeriod({
      month: attendanceMonth ?? currentDate.getMonth() + 1,
      year: attendanceYear ?? currentDate.getFullYear(),
    });
    setTab(!canViewPayroll && ["Salary", "Payroll Impact"].includes(initialTab) ? "Personal" : initialTab);
  }, [attendanceMonth, attendanceYear, canViewPayroll, initialTab, open]);
  const salaryQuery = useQuery({
    queryKey: ["employee-salary", employee?.id],
    queryFn: () => getEmployeeSalary(employee!.id!),
    enabled: Boolean(canViewPayroll && open && employee?.id),
  });
  const queryClient = useQueryClient();
  const [assigningSalary, setAssigningSalary] = useState(false);
  const [salaryForm, setSalaryForm] = useState({ salary_structure_id: "", gross_salary: "", effective_from: new Date().toISOString().slice(0, 10), reason: "" });
  const salaryStructuresQuery = useQuery({
    queryKey: ["salary-structures"],
    queryFn: getSalaryStructures,
    enabled: Boolean(canViewPayroll && open && assigningSalary),
  });
  const createSalaryMutation = useMutation({
    mutationFn: createSalaryAssignment,
    onSuccess: async () => {
      setAssigningSalary(false);
      setSalaryForm({ salary_structure_id: "", gross_salary: "", effective_from: new Date().toISOString().slice(0, 10), reason: "" });
      await queryClient.invalidateQueries({ queryKey: ["employee-salary", employee?.id] });
      await queryClient.invalidateQueries({ queryKey: ["employee-onboarding-progress", employee?.id] });
    },
  });
  const leaveBalancesQuery = useQuery({
    queryKey: ["employee-leave-balances", employee?.id],
    queryFn: () => getEmployeeLeaveBalances(employee!.id!),
    enabled: Boolean(open && employee?.id && tab === "Leave"),
  });
  const leaveHistoryQuery = useQuery({
    queryKey: ["employee-leave-history", employee?.id],
    queryFn: () => getEmployeeLeaveHistory(employee!.id!),
    enabled: Boolean(open && employee?.id && tab === "Leave"),
  });
  const attendanceQuery = useQuery({
    queryKey: ["employee-attendance-summary", employee?.id, month, year],
    queryFn: () => getEmployeeAttendanceSummary(employee!.id!, month, year),
    enabled: Boolean(open && employee?.id && tab === "Attendance"),
  });
  const payrollImpactQuery = useQuery({
    queryKey: ["employee-payroll-impact", employee?.id, month, year],
    queryFn: () => getEmployeePayrollImpact(employee!.id!, month, year),
    enabled: Boolean(canViewPayroll && open && employee?.id && tab === "Payroll Impact"),
  });
  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
    enabled: Boolean(open && employee?.id && tab === "Documents"),
  });
  const employeeDocuments = (documentsQuery.data ?? []).filter((document) => document.employee_id === employee?.id);
  const assetsQuery = useQuery({
    queryKey: ["employee-assets", employee?.id],
    queryFn: () => getAssets(employee!.id!),
    enabled: Boolean(open && employee?.id && tab === "Assets"),
  });
  const tabs = ["Personal", "Employment", "Documents", "Assets", ...(canViewPayroll ? ["Salary"] : []), "Leave", "Attendance", ...(canViewPayroll ? ["Payroll Impact"] : [])];
  const profileEmployee = employee ? {
    ...employee,
    salary: canViewPayroll ? salaryQuery.data?.current?.gross_salary_display ?? employee.salary : undefined,
  } : null;
  function moveAttendanceMonth(direction: -1 | 1) {
    setAttendancePeriod((current) => {
      const value = new Date(current.year, current.month - 1 + direction, 1);
      return { month: value.getMonth() + 1, year: value.getFullYear() };
    });
  }
  return (
    <DrawerPanel open={open} title="Employee Profile" size="2xl" onClose={onClose}>
      {employee ? (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              type="button"
              className="transition-all duration-200 ease-out hover:shadow-md hover:brightness-110 active:scale-95"
              onClick={() => onUpdate && onUpdate(profileEmployee ?? employee)}
              disabled={!onUpdate}
            >
              Update
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              className="border-rose-200 text-rose-600 transition-all duration-200 ease-out hover:bg-rose-50 hover:border-rose-300 hover:shadow-sm active:scale-95"
              onClick={() => onDeactivate && onDeactivate(profileEmployee ?? employee)}
              disabled={!onDeactivate}
            >
              Deactivate
            </Button>
          </div>
          {extraHeader}
          <div className="flex gap-1 border-b pb-0 overflow-x-auto scrollbar-none -mb-px">
            {tabs.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={tab === item ? "default" : "ghost"}
                className="shrink-0 rounded-b-none"
                onClick={() => setTab(item)}
              >
                {item}
              </Button>
            ))}
          </div>
          {tab === "Personal" ? (
            <div className="space-y-4">
              <EmployeePreviewCard employee={profileEmployee} showActions={false} />
              <EmployeePersonalDetailsCard employee={profileEmployee} />
            </div>
          ) : null}
          {tab === "Employment" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCell label="Employment Type" value={(employee.employment_type ?? "FULL_TIME").replace(/_/g, " ")} icon={<BriefcaseBusiness className="h-4 w-4" />} agent="employee_agent" />
                <InfoCell label="Employment Status" value={(employee.status ?? "ACTIVE").replace(/_/g, " ")} icon={<CheckCircle2 className="h-4 w-4" />} agent="employee_agent" />
              </div>
            </div>
          ) : null}
          {tab === "Salary" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <Button size="sm" variant={assigningSalary ? "outline" : "default"} onClick={() => setAssigningSalary((value) => !value)}>
                  {assigningSalary ? "Cancel" : "Assign Salary"}
                </Button>
              </div>
              {assigningSalary ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="text-sm font-semibold">New Salary Assignment</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">Salary structure</span>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={salaryForm.salary_structure_id}
                        onChange={(event) => setSalaryForm((current) => ({ ...current, salary_structure_id: event.target.value }))}
                      >
                        <option value="">{salaryStructuresQuery.isLoading ? "Loading structures..." : "Select a structure"}</option>
                        {(salaryStructuresQuery.data ?? []).map((structure) => (
                          <option key={structure.id} value={structure.id}>{structure.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">Gross salary</span>
                      <input
                        type="number"
                        min="1"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={salaryForm.gross_salary}
                        onChange={(event) => setSalaryForm((current) => ({ ...current, gross_salary: event.target.value }))}
                      />
                    </label>
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">Effective from</span>
                      <input
                        type="date"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={salaryForm.effective_from}
                        onChange={(event) => setSalaryForm((current) => ({ ...current, effective_from: event.target.value }))}
                      />
                    </label>
                    <label className="space-y-1.5 text-sm sm:col-span-2">
                      <span className="font-medium">Reason (optional)</span>
                      <input
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={salaryForm.reason}
                        onChange={(event) => setSalaryForm((current) => ({ ...current, reason: event.target.value }))}
                        placeholder="e.g. Initial onboarding assignment"
                      />
                    </label>
                  </div>
                  {createSalaryMutation.isError ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">Could not create the assignment. Check the structure and salary amount.</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">Confirming this will make it the employee's active salary immediately.</p>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!employee?.id || !salaryForm.salary_structure_id || !salaryForm.gross_salary || !salaryForm.effective_from || createSalaryMutation.isPending}
                      onClick={() =>
                        employee?.id &&
                        createSalaryMutation.mutate({
                          employee_id: employee.id,
                          salary_structure_id: salaryForm.salary_structure_id,
                          gross_salary: Number(salaryForm.gross_salary),
                          effective_from: salaryForm.effective_from,
                          reason: salaryForm.reason || undefined,
                        })
                      }
                    >
                      {createSalaryMutation.isPending ? "Confirming..." : "Confirm Assignment"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {salaryQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading salary details...</p> : null}
              {salaryQuery.data?.current ? (
                <>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-semibold">Current Salary Structure</p>
                    <p className="mt-1 text-sm text-muted-foreground">{salaryQuery.data.current.salary_structure}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <InfoCell label="Gross Salary" value={salaryQuery.data.current.gross_salary_display} icon={<BadgeDollarSign className="h-4 w-4" />} agent="payroll_agent" />
                      <InfoCell label="Effective Date" value={salaryQuery.data.current.effective_from ?? "Not set"} icon={<CheckCircle2 className="h-4 w-4" />} agent="employee_agent" />
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-semibold">Monthly Breakup</p>
                    {salaryQuery.data.breakup ? <div className="mt-3 space-y-2">
                      {salaryQuery.data.breakup.items.map((item) => (
                        <div key={item.component_code} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                          <span>{item.component_name}</span>
                          <span className="font-medium">{item.amount_display}</span>
                        </div>
                      ))}
                    </div> : <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Assign a salary structure to calculate the component breakup.</p>}
                  </div>
                </>
              ) : !salaryQuery.isLoading ? (
                <p className="rounded-lg border p-4 text-sm text-muted-foreground">No active salary assignment found.</p>
              ) : null}
              <div className="rounded-lg border p-4">
                <p className="text-sm font-semibold">Revision History</p>
                <div className="mt-3 space-y-2">
                  {salaryQuery.data?.history?.length ? salaryQuery.data.history.map((row, index) => (
                    <div key={String(row.id ?? index)} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span>{String(row.revision_type ?? "Revision")}</span>
                        <span className="text-muted-foreground">{String(row.effective_from ?? "")}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{String(row.old_salary ?? "New")} {"->"} {String(row.new_salary ?? "-")}</p>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No revisions yet.</p>}
                </div>
              </div>
            </div>
          ) : null}
          {tab === "Leave" ? (
            <div className="space-y-4">
              {leaveBalancesQuery.isLoading || leaveHistoryQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading leave details...</p> : null}
              <LeaveBalanceCard balances={(leaveBalancesQuery.data ?? []) as Array<Record<string, any>>} />
              <div className="rounded-lg border p-4">
                <p className="text-sm font-semibold">Leave History</p>
                <div className="mt-3 space-y-2">
                  {(leaveHistoryQuery.data ?? []).length ? (leaveHistoryQuery.data ?? []).map((request, index) => (
                    <LeaveRequestCard key={String(request.id ?? index)} request={request} />
                  )) : <p className="text-sm text-muted-foreground">No leave history yet.</p>}
                </div>
              </div>
            </div>
          ) : null}
          {tab === "Attendance" ? (
            <div className="space-y-3">
              {attendanceQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading monthly attendance...</p> : null}
              {attendanceQuery.data ? (
                <EmployeeMonthlyAttendancePanel
                  summary={attendanceQuery.data}
                  onPrevious={() => moveAttendanceMonth(-1)}
                  onNext={() => moveAttendanceMonth(1)}
                />
              ) : null}
            </div>
          ) : null}
          {tab === "Payroll Impact" ? (
            <div className="space-y-4">
              <div className={cn("rounded-lg border p-4", agentThemeFor("payroll_agent").soft)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">Current Salary</p>
                    <p className="mt-1 text-sm text-muted-foreground">Raw payroll figure used for onboarding and payroll processing.</p>
                  </div>
                  {onUpdate ? (
                    <Button size="sm" variant="outline" onClick={() => onUpdate(profileEmployee ?? employee)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4">
                  <InfoCell
                    label="Current Salary"
                    value={employee.current_salary != null ? `₹${Number(employee.current_salary).toLocaleString("en-IN")}` : "Not set"}
                    icon={<BadgeDollarSign className="h-4 w-4" />}
                    agent="payroll_agent"
                  />
                </div>
              </div>
              {(() => {
                const payrollReady = Boolean(profileEmployee?.bank_account_number && profileEmployee?.ifsc_code && profileEmployee?.pan_number);
                return (
                  <div className={cn("rounded-lg border p-4", agentThemeFor("employee_agent").soft)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold">Payroll Readiness</p>
                        <p className="mt-1 text-sm text-muted-foreground">Bank and statutory details required before payroll processing.</p>
                      </div>
                      <WorkflowStatusPill status={payrollReady ? "Ready" : "Incomplete"} agent="employee_agent" />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <InfoCell label="Bank Account" value={profileEmployee?.bank_account_number ?? "Not provided"} icon={<Landmark className="h-4 w-4" />} agent="employee_agent" />
                      <InfoCell label="IFSC Code" value={profileEmployee?.ifsc_code ?? "Not provided"} icon={<Landmark className="h-4 w-4" />} agent="employee_agent" />
                      <InfoCell label="PAN Number" value={profileEmployee?.pan_number ?? "Not provided"} icon={<Landmark className="h-4 w-4" />} agent="employee_agent" />
                    </div>
                    {!payrollReady && onUpdate ? (
                      <div className="mt-4 border-t pt-3">
                        <Button size="sm" onClick={() => onUpdate(profileEmployee ?? employee)}>Update Employee</Button>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
              {payrollImpactQuery.isLoading ? <p className="text-sm text-muted-foreground">Preparing payroll impact...</p> : null}
              {payrollImpactQuery.data ? (
                <>
                  <div className={cn("rounded-lg border p-4", agentThemeFor("payroll_agent").soft)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold">Payroll Impact Preview</p>
                        <p className="mt-1 text-sm text-muted-foreground">{month}/{year} · {(payrollImpactQuery.data.employment_type ?? "FULL_TIME").replace(/_/g, " ")}</p>
                      </div>
                      <WorkflowStatusPill status={payrollImpactQuery.data.salary_ready ? "Preview Ready" : "Needs Setup"} agent="payroll_agent" />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Metric label="Working Days" value={String(payrollImpactQuery.data.attendance.working_days)} agent="attendance_agent" />
                      <Metric label="Payable Days" value={String(payrollImpactQuery.data.attendance.payable_days)} agent="attendance_agent" />
                      <Metric label="LOP Days" value={String(payrollImpactQuery.data.attendance.lop_days)} agent="leave_agent" />
                      <Metric label="Gross Salary" value={payrollImpactQuery.data.gross_salary_display ?? "Not assigned"} agent="payroll_agent" />
                      <Metric label="LOP Deduction" value={payrollImpactQuery.data.lop_deduction_display ?? "Not available"} agent="approval_agent" />
                      <Metric label="Estimated Net" value={payrollImpactQuery.data.estimated_net_display ?? "Not available"} agent="payroll_agent" />
                    </div>
                  </div>
                  {payrollImpactQuery.data.blocking_issues.length ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
                      <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" /> Review before payroll</div>
                      <div className="mt-2 space-y-1 text-sm">{payrollImpactQuery.data.blocking_issues.map((issue) => <p key={issue}>{issue}</p>)}</div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          {tab === "Assets" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">
                  {assetsQuery.isLoading ? "Loading…" : `Assets (${assetsQuery.data?.length ?? 0})`}
                </p>
              </div>
              {assetsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading assets...</p> : null}
              {!assetsQuery.isLoading && !assetsQuery.data?.length ? (
                <p className="rounded-lg border p-4 text-sm text-muted-foreground">No assets assigned.</p>
              ) : null}
              {(assetsQuery.data ?? []).length ? (
                <div className="divide-y rounded-lg border">
                  {(assetsQuery.data ?? []).map((asset: AssetRecord) => (
                    <div key={asset.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", agentThemeFor("asset_agent").icon)}>
                          <Laptop className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {asset.asset_type}{asset.asset_name ? ` — ${asset.asset_name}` : ""}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{asset.asset_code}</p>
                          {asset.validity_date ? (
                            <p className={cn("text-xs", asset.is_expired ? "text-rose-600 font-medium" : "text-muted-foreground")}>
                              {asset.is_expired ? "⚠ Expired " : "Valid until "}{asset.validity_date}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <StatusBadge
                        status={asset.asset_status.replace(/_/g, " ")}
                        tone={asset.asset_status === "ASSIGNED" ? "success" : asset.asset_status === "RETURNED" ? "neutral" : asset.asset_status === "LOST" ? "danger" : "warning"}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "Documents" ? (
            <div className="space-y-4">
              <EmployeeDocumentUpload employeeId={employee.id!} onSuccess={() => documentsQuery.refetch()} />
              {documentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading documents...</p> : null}
              {documentsQuery.isError ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">Documents could not be loaded.</p> : null}
              {!documentsQuery.isLoading && !documentsQuery.isError ? (
                employeeDocuments.length ? (
                  <div className="divide-y rounded-lg border">
                    {employeeDocuments.map((document) => (
                      <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cn("flex h-9 w-9 items-center justify-center rounded-md border", agentThemeFor("document_agent").icon)}>
                            <FileCheck2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{document.document_type}</p>
                            {document.verified_at ? <p className="truncate text-xs text-muted-foreground">Verified {document.verified_at}</p> : null}
                            {document.expiry_date ? <p className="truncate text-xs text-muted-foreground">Expires: {document.expiry_date}</p> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={document.status} tone={document.status === "VERIFIED" ? "success" : document.status === "REJECTED" ? "danger" : "warning"} />
                          <Button variant="ghost" size="icon" aria-label="Open document" onClick={() => window.open(document.document_url, "_blank", "noopener,noreferrer")}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border p-4 text-sm text-muted-foreground">No documents on file yet.</p>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">No employee selected.</p>}
    </DrawerPanel>
  );
}

export function ApprovalDiffCard({
  currentSalary = "Not available",
  newSalary = "Not available",
  title = "Salary Change Request",
  status = "Approval Required",
  completed = false,
}: {
  currentSalary?: string;
  newSalary?: string;
  title?: string;
  status?: string;
  completed?: boolean;
}) {
  const theme = agentThemeFor("approval_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {completed ? "The compensation update has been approved and applied." : "A compensation update requires approval before execution."}
          </p>
        </div>
        <WorkflowStatusPill status={status} agent={completed ? "employee_agent" : "approval_agent"} />
      </div>
      {completed ? (
        <StatusBannerCard title="Approval completed" summary="The approved salary change has been applied to the employee record." agent="employee_agent" />
      ) : (
        <ApprovalBanner description="This request is paused until an authorized HR approver reviews the salary change." />
      )}
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <DiffValue label="Current Salary" value={currentSalary} agent="payroll_agent" />
        <ArrowRight className="mx-auto h-4 w-4 text-muted-foreground" />
        <DiffValue label="New Salary" value={newSalary} accent agent="approval_agent" />
      </div>
      <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        Difference: {salaryDifference(currentSalary, newSalary)}
      </div>
      {!completed ? (
        <EntityActionBar>
          <Button size="sm">Approve</Button>
          <Button size="sm" variant="outline">Reject</Button>
        </EntityActionBar>
      ) : null}
    </div>
  );
}

export function PayrollSummaryCard() {
  const theme = agentThemeFor("payroll_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Payroll Summary</h3>
          <p className="mt-1 text-sm text-muted-foreground">Payroll data will appear when the payroll agent is connected.</p>
        </div>
        <WorkflowStatusPill status="Approval Required" agent="approval_agent" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Employees Processed" value="Pending" agent="employee_agent" />
        <Metric label="Estimated Payout" value="₹8.7Cr" agent="payroll_agent" />
        <Metric label="Pending Approvals" value="3" agent="approval_agent" />
      </div>
      <ApprovalBanner description="Payroll generation is governed. Approval is required before bank sheet generation or completion." />
      <EntityActionBar>
        <Button size="sm" variant="outline">View Payroll</Button>
        <Button size="sm">Generate Bank Sheet</Button>
      </EntityActionBar>
    </div>
  );
}

export function LeaveSummaryCard() {
  const theme = agentThemeFor("leave_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Leave Operations Summary</h3>
          <p className="mt-1 text-sm text-muted-foreground">Leave request context is ready for review.</p>
        </div>
        <WorkflowStatusPill status="Ready" agent="leave_agent" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Open Requests" value="12" agent="leave_agent" />
        <Metric label="Policy Exceptions" value="2" agent="approval_agent" />
        <Metric label="Approved Today" value="8" agent="payroll_agent" />
      </div>
    </div>
  );
}

export function AttendanceStatusBadge({ status }: { status?: string | null }) {
  return <StatusBadge status={(status ?? "PENDING").replace("_", " ")} tone={statusToneFor(status ?? "PENDING")} />;
}

export function AttendanceSummaryCard({ summary }: { summary: Record<string, any> }) {
  const theme = agentThemeFor("attendance_agent");
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Attendance Summary</h3>
          <p className="mt-1 text-sm text-muted-foreground">{summary.employee_name ?? "Employee"} · {summary.month}/{summary.year}</p>
        </div>
        <WorkflowStatusPill status="Payroll Ready" agent="attendance_agent" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Present" value={String(summary.present_days ?? 0)} agent="attendance_agent" />
        <Metric label="WFH" value={String(summary.wfh_days ?? 0)} agent="notification_agent" />
        <Metric label="Paid Leave" value={String(summary.paid_leave_days ?? 0)} agent="leave_agent" />
        <Metric label="Absent" value={String(summary.absent_days ?? 0)} agent="approval_agent" />
        <Metric label="Half Day" value={String(summary.half_days ?? 0)} agent="approval_agent" />
        <Metric label="Payable Days" value={`${summary.payable_days ?? 0}/${summary.working_days ?? 0}`} agent="payroll_agent" />
      </div>
    </div>
  );
}

function EmployeeMonthlyAttendancePanel({
  summary,
  onPrevious,
  onNext,
}: {
  summary: Record<string, any>;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const statuses = [
    ["Present", summary.present_days ?? 0, "bg-emerald-500"],
    ["Work From Home", summary.wfh_days ?? 0, "bg-cyan-500"],
    ["Paid Leave", summary.paid_leave_days ?? 0, "bg-violet-500"],
    ["Absent", summary.absent_days ?? 0, "bg-rose-500"],
    ["Half Day", summary.half_days ?? 0, "bg-amber-500"],
  ];
  const calendarStyles: Record<string, string> = {
    PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
    WORK_FROM_HOME: "border-cyan-400 bg-cyan-100 text-cyan-800",
    WFH: "border-cyan-400 bg-cyan-100 text-cyan-800",
    PAID_LEAVE: "border-violet-400 bg-violet-100 text-violet-700",
    UNPAID_LEAVE: "border-red-500 bg-red-100 text-red-700",
    ABSENT: "border-rose-400 bg-rose-100 text-rose-700",
    HALF_DAY: "border-amber-400 bg-amber-100 text-amber-800",
    WEEKEND: "border-slate-400 bg-slate-200 text-slate-600",
    HOLIDAY: "border-blue-200 bg-blue-50 text-blue-700",
    MISSING: "border-zinc-200 bg-zinc-50 text-zinc-400",
  };
  const records = (summary.records ?? []) as Array<Record<string, any>>;
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    new Date(Number(summary.year), Number(summary.month) - 1, 1),
  );
  const calendarOffset = new Date(Number(summary.year), Number(summary.month) - 1, 1).getDay();
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function calendarIcon(status: string) {
    if (status === "ABSENT") return <X className="h-4 w-4 stroke-[2.5] text-rose-600" />;
    if (status === "PAID_LEAVE") return <Flag className="h-4 w-4 text-violet-700" />;
    if (status === "UNPAID_LEAVE") return <Flag className="h-4 w-4 fill-red-600 text-red-700" />;
    if (status === "WORK_FROM_HOME" || status === "WFH") return <Home className="h-4 w-4 stroke-[2.5] text-cyan-700" />;
    if (status === "WEEKEND") return <Ban className="h-4 w-4 text-slate-500" />;
    return null;
  }
  function summaryIcon(label: string, color: string) {
    if (label === "Absent") return <X className="h-3.5 w-3.5 text-rose-600" />;
    if (label === "Work From Home") return <Home className="h-3.5 w-3.5 text-cyan-700" />;
    return <span className={cn("h-2 w-2 rounded-full", color)} />;
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Monthly Summary</p>
            <p className="text-xs text-muted-foreground">{monthLabel}</p>
          </div>
          <StatusBadge status={`${summary.payable_days ?? 0}/${summary.working_days ?? 0} payable`} tone="info" />
        </div>
        <div className="divide-y px-4">
          {statuses.map(([label, value, color]) => (
            <div key={String(label)} className="flex h-9 items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                {summaryIcon(String(label), String(color))}
                {label}
              </span>
              <span className="font-semibold tabular-nums">{String(value)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 border-t bg-muted/40">
          <div className="border-r px-4 py-3">
            <p className="text-xs text-muted-foreground">LOP Days</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{summary.lop_days ?? 0}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Employment Type</p>
            <p className="mt-1 text-sm font-semibold">{String(summary.employment_type ?? "FULL_TIME").replace(/_/g, " ")}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onPrevious} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold">{monthLabel}</p>
            <p className="text-xs text-muted-foreground">{records.length} calendar days</p>
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onNext} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: calendarOffset }).map((_, index) => (
            <div key={`calendar-offset-${index}`} aria-hidden="true" className="aspect-square" />
          ))}
          {records.map((record) => {
            const status = String(record.status ?? record.attendance_status ?? "MISSING")
              .split(".")
              .at(-1)!
              .trim()
              .toUpperCase()
              .replace(/\s+/g, "_");
            const day = String(record.date ?? record.attendance_date ?? "").slice(-2).replace(/^0/, "");
            const icon = calendarIcon(status);
            return (
              <div
                key={String(record.date ?? record.attendance_date)}
                title={`${record.label ?? status.replace(/_/g, " ")} · ${record.date ?? record.attendance_date}`}
                className={cn(
                  "relative flex aspect-square min-w-0 items-center justify-center rounded-md border text-xs font-medium tabular-nums",
                  status === "WEEKEND" && "border-dashed",
                  calendarStyles[status] ?? calendarStyles.MISSING,
                )}
              >
                {icon ? (
                  <>
                    <span className="absolute left-1 top-0.5 text-[9px] opacity-75">{day}</span>
                    {icon}
                  </>
                ) : (
                  <span className="text-[11px]">{day}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 border-t pt-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3 text-violet-700" /> Paid leave</span>
          <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3 fill-rose-500 text-rose-600" /> Unpaid leave</span>
          <span className="inline-flex items-center gap-1"><X className="h-3 w-3 text-rose-600" /> Absent</span>
          <span className="inline-flex items-center gap-1"><Home className="h-3 w-3 text-cyan-700" /> WFH</span>
          <span className="inline-flex items-center gap-1"><Ban className="h-3 w-3 text-slate-400" /> Weekend</span>
        </div>
      </div>
    </>
  );
}

export function AttendanceTable({ records }: { records: Array<Record<string, any>> }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background/70">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium">Employee</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          {records.length ? records.map((record, index) => (
            <tr key={record.id ?? index} className="border-t">
              <td className="px-3 py-3 font-medium">{record.employee_name ?? "Employee"}</td>
              <td className="px-3 py-3 text-muted-foreground">{record.attendance_date ?? "-"}</td>
              <td className="px-3 py-3"><AttendanceStatusBadge status={record.attendance_status} /></td>
              <td className="px-3 py-3 text-muted-foreground">{record.total_hours ?? "-"}</td>
            </tr>
          )) : (
            <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>No attendance records found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AttendanceCalendarCard({ records }: { records: Array<Record<string, any>> }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-base font-semibold">Attendance Calendar</h3>
      <div className="grid grid-cols-7 gap-2">
        {records.slice(0, 31).map((record, index) => (
          <div key={record.id ?? index} className="rounded-md border p-2 text-center text-xs">
            <p className="font-medium">{String(record.attendance_date ?? "").slice(-2)}</p>
            <AttendanceStatusBadge status={record.attendance_status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LOPSummaryCard({ summary }: { summary: Record<string, any> }) {
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", agentThemeFor("payroll_agent").soft)}>
      <h3 className="text-base font-semibold">LOP Summary</h3>
      <div className="grid gap-3 sm:grid-cols-5">
        <Metric label="Working" value={String(summary.working_days ?? 0)} agent="attendance_agent" />
        <Metric label="Present" value={String(summary.present_days ?? 0)} agent="attendance_agent" />
        <Metric label="Paid Leave" value={String(summary.paid_leave_days ?? 0)} agent="leave_agent" />
        <Metric label="Unpaid Leave" value={String(summary.unpaid_leave_days ?? 0)} agent="approval_agent" />
        <Metric label="LOP" value={String(summary.lop_days ?? 0)} agent="payroll_agent" />
      </div>
    </div>
  );
}

export function LeaveBalanceCard({ balances }: { balances: Array<Record<string, any>> }) {
  const employeeId = balances.find((balance) => balance.employee_id)?.employee_id as string | undefined;
  const liveBalancesQuery = useQuery({
    queryKey: ["employee-leave-balances", employeeId],
    queryFn: () => getEmployeeLeaveBalances(employeeId!),
    enabled: Boolean(employeeId),
    initialData: balances,
    refetchOnMount: "always",
  });
  const displayedBalances = (liveBalancesQuery.data ?? balances) as Array<Record<string, any>>;
  const paidBalances = displayedBalances.filter((balance) => ["Paid Leave", "Casual Leave"].includes(String(balance.leave_type)));
  const totalRemaining = paidBalances.reduce((total, balance) => total + Number(balance.remaining ?? 0), 0);
  const totalAllocated = paidBalances.reduce((total, balance) => total + Number(balance.allocated ?? 0), 0);

  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", agentThemeFor("leave_agent").soft)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">Leave Balance</h3>
        {totalAllocated ? <StatusBadge status={`${totalRemaining}/${totalAllocated} paid days remaining`} tone="info" /> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {displayedBalances.map((balance) => (
          <Metric key={`${balance.leave_type}-${balance.year}`} label={balance.leave_type} value={`${balance.remaining ?? 0} remaining`} agent="leave_agent" />
        ))}
      </div>
    </div>
  );
}

export function LeaveRequestCard({ request }: { request: Record<string, any> }) {
  return (
    <div className={cn("space-y-3 rounded-lg border p-4 shadow-sm", agentThemeFor("leave_agent").soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{request.employee_name ?? "Employee"} leave request</h3>
          <p className="mt-1 text-sm text-muted-foreground">{request.leave_type} · {request.start_date} to {request.end_date}</p>
        </div>
        <WorkflowStatusPill status={request.status ?? "PENDING"} agent="leave_agent" />
      </div>
      <Metric label="Total Days" value={String(request.total_days ?? 0)} agent="leave_agent" />
    </div>
  );
}

export function LeaveApprovalCard({ requests }: { requests: Array<Record<string, any>> }) {
  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", agentThemeFor("approval_agent").soft)}>
      {requests.length ? (
        <>
          <ApprovalBanner description="Approving these leave requests will update balances and payroll LOP inputs." />
          {requests.map((request) => <LeaveRequestCard key={request.id} request={request} />)}
        </>
      ) : (
        <StatusBannerCard
          title="No pending leave approvals"
          summary="There are no leave requests waiting for approval right now."
          agent="leave_agent"
        />
      )}
    </div>
  );
}

export function LeaveCalendarView({ requests }: { requests: Array<Record<string, any>> }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-base font-semibold">Leave Calendar</h3>
      {requests.map((request) => <LeaveRequestCard key={request.id} request={request} />)}
    </div>
  );
}

function InfoCell({ label, value, icon, agent }: { label: string; value: string; icon: ReactNode; agent?: string | null }) {
  const theme = agentThemeFor(agent);
  return (
    <div className={cn("rounded-md border p-3", theme.soft)}>
      <div className={cn("flex items-center gap-2 text-xs font-medium uppercase", theme.text)}>
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function DiffValue({ label, value, accent = false, agent }: { label: string; value: string; accent?: boolean; agent?: string | null }) {
  const theme = agentThemeFor(agent);
  return (
    <div className={cn("rounded-md border p-3", accent ? cn(theme.tint, theme.border, theme.text) : theme.soft)}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Metric({ label, value, agent }: { label: string; value: string; agent?: string | null }) {
  const theme = agentThemeFor(agent);
  return (
    <div className={cn("rounded-md border p-3", theme.tint, theme.border, theme.text)}>
      <p className="text-xs font-medium uppercase opacity-70">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function ChecklistCard({ title, icon, agent, items }: { title: string; icon: ReactNode; agent: string; items: Array<{ name: string; status: string }> }) {
  const theme = agentThemeFor(agent);
  return (
    <div className={cn("rounded-lg border p-4", theme.soft)}>
      <div className={cn("flex items-center gap-2 text-sm font-semibold", theme.text)}>
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
            <span>{item.name}</span>
            <WorkflowStatusPill status={item.status} agent={agent} />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployeeDocumentUpload({ employeeId, onSuccess }: { employeeId: string; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState([{ document_type: "", expiry_date: "", file: null as File | null }]);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "document-form"],
    queryFn: () => getLookups(["document_type"]),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      for (const form of forms) {
        if (!form.document_type || !form.file) continue;
        const fd = new FormData();
        fd.append("employee_id", employeeId);
        fd.append("document_type", form.document_type);
        if (form.expiry_date) fd.append("expiry_date", form.expiry_date);
        fd.append("file", form.file);
        await createDocument(fd);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      setOpen(false);
      setForms([{ document_type: "", expiry_date: "", file: null }]);
      setError(null);
      onSuccess();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Upload failed."),
  });

  function updateForm(index: number, key: string, value: string | File | null) {
    setForms((prev) => prev.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  }

  const canSubmit = forms.some((f) => f.document_type && f.file);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
      >
        + Upload Document
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Upload Documents</p>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
      <p className="text-xs text-muted-foreground">All documents uploaded here are marked as Verified immediately.</p>

      {forms.map((form, index) => (
        <div key={index} className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Document #{index + 1}</p>
            {forms.length > 1 ? (
              <button type="button" onClick={() => setForms((p) => p.filter((_, i) => i !== index))} className="text-xs text-rose-500 hover:text-rose-700">Remove</button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Document Type *</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={form.document_type}
                onChange={(e) => updateForm(index, "document_type", e.target.value)}
              >
                <option value="">Select type</option>
                {(lookupsQuery.data?.document_type ?? []).map((item) => (
                  <option key={item.id} value={item.label}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Expiry Date</span>
              <input
                type="date"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={form.expiry_date}
                onChange={(e) => updateForm(index, "expiry_date", e.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">File *</span>
              <div
                className="flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/20 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                onClick={() => fileRefs.current[index]?.click()}
              >
                {form.file ? (
                  <span className="font-medium text-foreground text-xs">{form.file.name}</span>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span className="text-xs">Click to choose file</span>
                    <span className="text-xs opacity-60">Max 5MB</span>
                  </>
                )}
              </div>
              <input
                ref={(el) => { fileRefs.current[index] = el; }}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) { setError("File must be under 5MB."); return; }
                  updateForm(index, "file", file);
                  setError(null);
                }}
              />
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setForms((p) => [...p, { document_type: "", expiry_date: "", file: null }])}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/20 px-3 py-2 text-xs text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
      >
        + Add Another Document
      </button>

      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Uploading..." : "Upload Documents"}
        </Button>
      </div>
    </div>
  );
}

function salaryDifference(currentSalary: string, newSalary: string) {
  const current = Number(currentSalary.replace(/[^\d]/g, ""));
  const next = Number(newSalary.replace(/[^\d]/g, ""));
  if (!next) return "Pending calculation";
  if (!current) return "Initial salary assignment";
  const diff = next - current;
  const sign = diff >= 0 ? "+" : "-";
  return `${sign}₹${Math.abs(diff).toLocaleString("en-IN")}`;
}