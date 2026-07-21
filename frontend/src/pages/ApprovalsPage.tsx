import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Play, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AppLayout,
  DrawerPanel,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  SectionCard,
  StatusBadge,
  Timeline,
} from "@/components/ui-system";
import {
  approveApproval,
  getApproval,
  getPendingApprovals,
  needsChangesApproval,
  rejectApproval,
  resumeApprovalWorkflow,
  type ApprovalRequest,
} from "@/services/approvals";
import { useAuthStore } from "@/stores/authStore";

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "APPROVED" || status === "EXECUTED") return "success";
  if (status === "REJECTED" || status === "FAILED") return "danger";
  if (status === "NEEDS_CHANGES") return "warning";
  return "info";
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function payloadPreview(payload: Record<string, unknown> | null) {
  if (!payload) return "No payload supplied";
  return JSON.stringify(payload, null, 2);
}

function humanize(value: string | null | undefined) {
  if (!value) return "Not available";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object").map((item) => item as Record<string, unknown>)
    : [];
}

function textValue(value: unknown, fallback = "Not provided") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return value.toLocaleString("en-IN");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function approvalTitle(approval: ApprovalRequest) {
  const payload = asRecord(approval.payload_json);
  const candidate = asRecord(payload.candidate);
  const employee = asRecord(payload.employee);
  const leaveRequests = asList(payload.requests);
  if (approval.module_name === "leave" && leaveRequests.length) {
    const first = leaveRequests[0];
    return `${textValue(first.employee_name, "Employee")} - ${textValue(first.leave_type, "Leave")} request`;
  }
  const name = textValue(candidate.name ?? employee.name ?? payload.employee_name ?? payload.name, "");
  const action = approval.module_name === "onboarding" ? "Onboard employee" : humanize(approval.action_name);
  return name ? `${action}: ${name}` : action;
}

function approvalSummary(approval: ApprovalRequest) {
  const payload = asRecord(approval.payload_json);
  const candidate = asRecord(payload.candidate);
  if (approval.module_name === "onboarding") {
    return [
      textValue(candidate.designation ?? payload.designation, ""),
      textValue(candidate.department ?? payload.department, ""),
      textValue(candidate.joining_date ?? payload.joining_date, ""),
    ].filter(Boolean).join(" - ") || "Employee onboarding request";
  }
  if (approval.module_name === "employee" && approval.action_name.includes("salary")) {
    return `Salary change from ${textValue(payload.current_value)} to ${textValue(payload.proposed_value)}.`;
  }
  if (approval.module_name === "leave") {
    const requests = asList(payload.requests);
    if (requests.length) {
      const first = requests[0];
      return `${textValue(first.employee_name, "Employee")} requested ${textValue(first.leave_type, "leave")} from ${textValue(first.start_date)} to ${textValue(first.end_date)}.`;
    }
    return "Leave approval request awaiting HR review.";
  }
  return approval.approval_reason ?? "Approval required before this HR action can continue.";
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border bg-background/70 px-3 py-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{textValue(value)}</p>
    </div>
  );
}

function RequestedChangeSummary({ approval }: { approval: ApprovalRequest }) {
  const payload = asRecord(approval.payload_json);
  const candidate = asRecord(payload.candidate);
  const employee = asRecord(payload.employee);
  const documents = asList(payload.documents);
  const assets = asList(payload.assets);

  if (approval.module_name === "onboarding") {
    const person = Object.keys(candidate).length ? candidate : payload;
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Employee to onboard</p>
          <p className="mt-1 text-sm text-muted-foreground">Review the new employee details before the employee record is created.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Name" value={person.name} />
          <DetailItem label="Designation" value={person.designation} />
          <DetailItem label="Department" value={person.department} />
          <DetailItem label="Manager" value={person.manager} />
          <DetailItem label="Joining Date" value={person.joining_date} />
          <DetailItem label="Employment Type" value={person.employment_type} />
          <DetailItem label="Salary" value={person.salary} />
          <DetailItem label="Email" value={person.email} />
        </div>
        {documents.length ? (
          <div>
            <p className="text-sm font-semibold">Documents</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {documents.map((document, index) => (
                <DetailItem key={`${document.name}-${index}`} label={textValue(document.name, "Document")} value={humanize(textValue(document.status))} />
              ))}
            </div>
          </div>
        ) : null}
        {assets.length ? (
          <div>
            <p className="text-sm font-semibold">Assets and access</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {assets.map((asset, index) => (
                <DetailItem key={`${asset.name}-${index}`} label={textValue(asset.name, "Asset")} value={humanize(textValue(asset.status))} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (approval.module_name === "employee" && (approval.action_name.includes("salary") || payload.current_value || payload.proposed_value)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">This compensation change needs approval before it updates the employee record.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Employee" value={employee.name ?? payload.employee_name ?? payload.name} />
          <DetailItem label="Current Value" value={payload.current_value} />
          <DetailItem label="Proposed Value" value={payload.proposed_value} />
          <DetailItem label="Reason" value={payload.reason ?? approval.approval_reason} />
        </div>
      </div>
    );
  }

  if (approval.module_name === "leave") {
    const requests = asList(payload.requests);
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Review leave requests before balances are updated.</p>
        {(requests.length ? requests : [payload]).map((request, index) => (
          <div key={`${request.id}-${index}`} className="grid gap-3 rounded-md border bg-background/70 p-3 sm:grid-cols-2">
            <DetailItem label="Employee" value={request.employee_name} />
            <DetailItem label="Leave Type" value={request.leave_type} />
            <DetailItem label="From" value={request.start_date} />
            <DetailItem label="To" value={request.end_date} />
            <DetailItem label="Days" value={request.total_days} />
            <DetailItem label="Status" value={humanize(textValue(request.status))} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(payload).filter(([, value]) => typeof value !== "object").slice(0, 8);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.length ? (
        entries.map(([key, value]) => <DetailItem key={key} label={humanize(key)} value={value} />)
      ) : (
        <p className="text-sm text-muted-foreground">No readable request details were provided.</p>
      )}
    </div>
  );
}

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const isDebugMode = Boolean(currentUser?.is_superuser);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const approvalsQuery = useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: getPendingApprovals,
  });

  const detailQuery = useQuery({
    queryKey: ["approvals", selectedId],
    queryFn: () => getApproval(selectedId!),
    enabled: Boolean(selectedId),
  });

  const refreshApprovals = async () => {
    await queryClient.invalidateQueries({ queryKey: ["approvals"] });
    await queryClient.invalidateQueries({ queryKey: ["employees"] });
    await queryClient.invalidateQueries({ queryKey: ["employee-salary"] });
    await queryClient.invalidateQueries({ queryKey: ["onboarding-workflows"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-command-workflows"] });
    await queryClient.invalidateQueries({ queryKey: ["attendance-matrix"] });
    await queryClient.invalidateQueries({ queryKey: ["attendance-dashboard"] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveApproval(id, "Approved from Approval Inbox"),
    onSuccess: refreshApprovals,
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => rejectApproval(id, comment),
    onSuccess: async () => {
      setRejectTargetId(null);
      setRejectComment("");
      await refreshApprovals();
    },
  });
  const needsChangesMutation = useMutation({
    mutationFn: (id: string) => needsChangesApproval(id, "Needs changes from Approval Inbox"),
    onSuccess: refreshApprovals,
  });
  const resumeMutation = useMutation({
    mutationFn: (id: string) => resumeApprovalWorkflow(id),
    onSuccess: refreshApprovals,
  });

  const approvals = approvalsQuery.data ?? [];
  const isActionRunning = approveMutation.isPending || rejectMutation.isPending || needsChangesMutation.isPending || resumeMutation.isPending;
  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return approvals.filter((approval) =>
      [approval.module_name, approval.action_name, approval.approval_reason, approvalTitle(approval), approvalSummary(approval), payloadPreview(approval.payload_json)]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [approvals, search]);

  function ApprovalRow({ approval }: { approval: ApprovalRequest }) {
    const canAct = approval.status === "PENDING";
    return (
      <article className="rounded-lg border bg-card p-5 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <button type="button" className="min-w-0 flex-1 space-y-3 text-left" onClick={() => setSelectedId(approval.id)}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={humanize(approval.module_name)} tone="info" />
              <StatusBadge status={humanize(approval.status)} tone={statusTone(approval.status)} />
              <StatusBadge status={humanize(approval.execution_status)} tone="neutral" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{approvalTitle(approval)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">Requested {formatDate(approval.created_at)}</p>
            </div>
            <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{approvalSummary(approval)}</p>
          </button>
          {canAct ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={isActionRunning} onClick={() => needsChangesMutation.mutate(approval.id)}>
                <RotateCcw className="h-4 w-4" />
                Needs Changes
              </Button>
              <Button variant="outline" size="sm" disabled={isActionRunning} onClick={() => openRejectDialog(approval.id)}>
                <X className="h-4 w-4" />
                Reject
              </Button>
              <Button size="sm" disabled={isActionRunning} onClick={() => approveMutation.mutate(approval.id)}>
                <Check className="h-4 w-4" />
                Approve
              </Button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  const selected = detailQuery.data;
  const selectedCanAct = selected?.status === "PENDING";
  const selectedCanResume = selected?.status === "APPROVED" && selected.execution_status !== "EXECUTED";

  function openRejectDialog(id: string) {
    setRejectTargetId(id);
    setRejectComment("");
  }

  function submitReject() {
    if (!rejectTargetId || !rejectComment.trim()) return;
    rejectMutation.mutate({ id: rejectTargetId, comment: rejectComment.trim() });
  }

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Approval Inbox" description="Review employee, onboarding, payroll, and leave actions before they are applied." />
        <SectionCard>
          <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search approvals, employees, modules" />
        </SectionCard>
        {approvalsQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {approvalsQuery.isError ? <ErrorState message="Unable to load approval queue." /> : null}
        {!approvalsQuery.isLoading && filtered.length === 0 ? (
          <SectionCard>
            <EmptyState title="No pending approvals" description="All governed workflows are currently clear." />
          </SectionCard>
        ) : null}
        <div className="space-y-4">
          {filtered.map((approval) => (
            <ApprovalRow key={approval.id} approval={approval} />
          ))}
        </div>
      </PageContainer>

      <DrawerPanel open={Boolean(selected)} title="Approval Details" size="2xl" onClose={() => setSelectedId(null)}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}
        {selected ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={humanize(selected.module_name)} tone="info" />
                <StatusBadge status={humanize(selected.status)} tone={statusTone(selected.status)} />
                <StatusBadge status={humanize(selected.execution_status)} tone="neutral" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{approvalTitle(selected)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selected.approval_reason}</p>
              </div>
            </div>

            <SectionCard title="Request Summary">
              <RequestedChangeSummary approval={selected} />
            </SectionCard>

            <SectionCard title="Status">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Requested By</span>
                  <span className="truncate font-medium">{selected.requested_by ?? "System"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Resumed At</span>
                  <span className="font-medium">{formatDate(selected.resumed_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Executed At</span>
                  <span className="font-medium">{formatDate(selected.executed_at)}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Approval Timeline">
              <Timeline
                items={selected.events.map((event) => ({
                  id: event.id,
                  title: humanize(event.event_type),
                  time: formatDate(event.created_at),
                  description: event.message,
                }))}
              />
            </SectionCard>

            <SectionCard title="Audit Trail">
              <Timeline
                items={selected.audit_logs.map((audit) => ({
                  id: audit.id,
                  title: humanize(audit.action),
                  time: formatDate(audit.created_at),
                  description: audit.performed_by ? `Performed by ${audit.performed_by}` : "Performed by system",
                }))}
              />
            </SectionCard>

            {isDebugMode ? (
              <>
                <SectionCard title="Admin Payload">
                  <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                    {payloadPreview(selected.payload_json)}
                  </pre>
                </SectionCard>
                <SectionCard title="Admin Workflow State">
                  <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                    {payloadPreview(selected.workflow_state_json)}
                  </pre>
                </SectionCard>
              </>
            ) : null}

            {selectedCanAct || (isDebugMode && selectedCanResume) ? (
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                {selectedCanAct ? (
                  <>
                    <Button variant="outline" disabled={isActionRunning} onClick={() => needsChangesMutation.mutate(selected.id)}>
                      <RotateCcw className="h-4 w-4" />
                      Needs Changes
                    </Button>
                    <Button variant="outline" disabled={isActionRunning} onClick={() => openRejectDialog(selected.id)}>
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button disabled={isActionRunning} onClick={() => approveMutation.mutate(selected.id)}>
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                  </>
                ) : null}
                {isDebugMode && selectedCanResume ? (
                  <Button variant="secondary" disabled={isActionRunning} onClick={() => resumeMutation.mutate(selected.id)}>
                    <Play className="h-4 w-4" />
                    Resume Workflow
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {detailQuery.isError ? <ErrorState title="Unable to load approval" message="The selected approval could not be loaded." /> : null}
      </DrawerPanel>

      {rejectTargetId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-soft">
            <div>
              <h2 className="text-base font-semibold">Reject Approval</h2>
              <p className="mt-1 text-sm text-muted-foreground">Add a clear rejection reason. This will be saved in the approval timeline and audit trail.</p>
            </div>
            <label className="mt-4 block text-sm font-medium" htmlFor="reject-comment">
              Rejection comment
            </label>
            <textarea
              id="reject-comment"
              className="mt-2 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Example: Leave overlaps with payroll closure. Please choose another date."
              value={rejectComment}
              onChange={(event) => setRejectComment(event.target.value)}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={rejectMutation.isPending} onClick={() => setRejectTargetId(null)}>
                Cancel
              </Button>
              <Button className="bg-rose-600 text-white hover:bg-rose-700" disabled={!rejectComment.trim() || rejectMutation.isPending} onClick={submitReject}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
