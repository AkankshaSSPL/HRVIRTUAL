import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock3, RefreshCw, Search, Send, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppLayout,
  DrawerPanel,
  EmptyState,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { applyLeave, getLeavePolicies, getLeaveWorkspace, type LeaveRequest } from "@/services/leave";
import { getEmployees } from "@/services/employees";

function requestDate(request: LeaveRequest) {
  const from = request.from_date ?? request.start_date ?? "Date not set";
  const to = request.to_date ?? request.end_date ?? from;
  return from === to ? from : `${from} to ${to}`;
}

function requestTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  return "neutral";
}

export function LeavePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [applyingLeave, setApplyingLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employee_id: "", leave_type: "Casual Leave", start_date: "", end_date: "", reason: "" });
  const workspaceQuery = useQuery({
    queryKey: ["leave-workspace"],
    queryFn: getLeaveWorkspace,
    refetchInterval: 15000,
  });
  const workspace = workspaceQuery.data;
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees, enabled: applyingLeave });
  const policiesQuery = useQuery({ queryKey: ["leave-policies"], queryFn: getLeavePolicies, enabled: applyingLeave });
  const applyMutation = useMutation({
    mutationFn: applyLeave,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leave-workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["attendance-matrix"] });
      setApplyingLeave(false);
      setLeaveForm({ employee_id: "", leave_type: "Casual Leave", start_date: "", end_date: "", reason: "" });
    },
  });

  const filteredEmployees = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return workspace?.employees ?? [];
    return (workspace?.employees ?? []).filter(({ employee }) =>
      [employee.name, employee.department, employee.designation].some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [search, workspace?.employees]);

  const approvedUpcoming = (workspace?.calendar ?? []).filter((request) => request.status === "APPROVED");
  const employeesOnLeave = new Set(approvedUpcoming.map((request) => request.employee_id)).size;
  const paidRemaining = (workspace?.employees ?? []).reduce((total, summary) => total + summary.remaining, 0);

  function openCommand(command: string) {
    navigate("/agent-command", { state: { draftCommand: command } });
  }

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="Leave"
          description="Live leave balances, requests, approvals, and upcoming workforce availability."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => workspaceQuery.refetch()} disabled={workspaceQuery.isFetching}>
                <RefreshCw className={cn("h-4 w-4", workspaceQuery.isFetching && "animate-spin")} />
                Refresh
              </Button>
              <Button onClick={() => setApplyingLeave(true)}>
                <Send className="h-4 w-4" />
                Apply Leave
              </Button>
            </div>
          }
        />

        {workspaceQuery.isLoading ? <LoadingSkeleton rows={7} /> : null}
        {workspaceQuery.isError ? (
          <EmptyState
            title="Unable to load leave data"
            description="The live leave workspace could not be retrieved. Check that the backend is running, then refresh."
            actionLabel="Try again"
            onAction={() => workspaceQuery.refetch()}
          />
        ) : null}

        {workspace ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Pending Approvals", value: workspace.pending.length, icon: Clock3, style: "border-amber-200 bg-amber-50 text-amber-800" },
                { label: "Upcoming Approved Leave", value: approvedUpcoming.length, icon: CalendarDays, style: "border-blue-200 bg-blue-50 text-blue-800" },
                { label: "Employees on Calendar", value: employeesOnLeave, icon: Users, style: "border-violet-200 bg-violet-50 text-violet-800" },
                { label: "Paid Days Remaining", value: paidRemaining, icon: CheckCircle2, style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
              ].map(({ label, value, icon: Icon, style }) => (
                <SectionCard key={label} className={cn("border", style)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase opacity-75">{label}</p>
                      <p className="mt-2 text-2xl font-semibold">{value}</p>
                    </div>
                    <Icon className="h-5 w-5 opacity-70" />
                  </div>
                </SectionCard>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
              <SectionCard
                title="Employee Leave Balances"
                description="Current paid leave entitlement across active employee records."
                action={
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search employees" />
                  </div>
                }
              >
                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[minmax(180px,1fr)_80px_80px_80px] gap-3 bg-muted px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                    <span>Employee</span>
                    <span className="text-right">Allocated</span>
                    <span className="text-right">Used</span>
                    <span className="text-right">Remaining</span>
                  </div>
                  {filteredEmployees.map(({ employee, allocated, used, remaining, balances }) => (
                    <button
                      type="button"
                      key={employee.id}
                      onClick={() => openCommand(`Show ${employee.name ?? "employee"} leave balance`)}
                      className="grid w-full grid-cols-[minmax(180px,1fr)_80px_80px_80px] gap-3 border-t px-4 py-3 text-left transition hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{employee.name ?? "Unnamed employee"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {employee.department ?? "Unassigned"} · {balances.map((balance) => `${balance.leave_type} ${balance.remaining}`).join(" · ") || "No balance assigned"}
                        </span>
                      </span>
                      <span className="text-right text-sm">{allocated}</span>
                      <span className="text-right text-sm">{used}</span>
                      <span className="text-right text-sm font-semibold text-emerald-700">{remaining}</span>
                    </button>
                  ))}
                  {!filteredEmployees.length ? <p className="border-t p-6 text-center text-sm text-muted-foreground">No employee leave balances match this search.</p> : null}
                </div>
              </SectionCard>

              <SectionCard
                title="Pending Approvals"
                description="Leave requests waiting for an authorized reviewer."
                action={<Button size="sm" variant="outline" onClick={() => navigate("/approvals")}>Open Inbox</Button>}
              >
                <div className="space-y-3">
                  {workspace.pending.slice(0, 6).map((request) => (
                    <button
                      type="button"
                      key={request.id}
                      onClick={() => openCommand(`Show pending leave approvals for ${request.employee_name}`)}
                      className="w-full rounded-md border p-3 text-left transition hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{request.employee_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{request.leave_type} · {requestDate(request)}</p>
                        </div>
                        <StatusBadge status={request.status} tone="warning" />
                      </div>
                    </button>
                  ))}
                  {!workspace.pending.length ? <EmptyState title="No pending leave approvals" description="New leave requests requiring review will appear here." /> : null}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Upcoming Leave Calendar" description="Approved and pending workforce leave over the next 30 days.">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {workspace.calendar.map((request) => (
                  <div key={request.id} className="rounded-md border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{request.employee_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{request.leave_type}</p>
                      </div>
                      <StatusBadge status={request.status} tone={requestTone(request.status)} />
                    </div>
                    <p className="mt-3 text-sm">{requestDate(request)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{request.total_days} working day{request.total_days === 1 ? "" : "s"}</p>
                  </div>
                ))}
                {!workspace.calendar.length ? <div className="md:col-span-2 xl:col-span-3"><EmptyState title="No upcoming leave" description="Approved and pending leave requests will appear on this calendar." /></div> : null}
              </div>
            </SectionCard>
          </>
        ) : null}
        <DrawerPanel open={applyingLeave} title="Apply Leave" size="2xl" onClose={() => setApplyingLeave(false)}>
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold">Leave request</h3>
              <p className="mt-1 text-sm text-muted-foreground">Submit a leave request directly. Approval and attendance updates continue through the existing workflow.</p>
            </div>
            <FormField label="Employee">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={leaveForm.employee_id} onChange={(event) => setLeaveForm((current) => ({ ...current, employee_id: event.target.value }))}>
                <option value="">Select employee</option>
                {(employeesQuery.data?.items ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </FormField>
            <FormField label="Leave type">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={leaveForm.leave_type} onChange={(event) => setLeaveForm((current) => ({ ...current, leave_type: event.target.value }))}>
                {(policiesQuery.data ?? []).map((policy) => <option key={policy.id} value={policy.name}>{policy.name}{policy.affects_payroll ? " · Payroll impact" : ""}</option>)}
              </select>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="From date"><Input type="date" value={leaveForm.start_date} onChange={(event) => setLeaveForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date || event.target.value }))} /></FormField>
              <FormField label="To date"><Input type="date" value={leaveForm.end_date} onChange={(event) => setLeaveForm((current) => ({ ...current, end_date: event.target.value }))} /></FormField>
            </div>
            <FormField label="Reason">
              <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} />
            </FormField>
            {applyMutation.isError ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Leave request could not be submitted. Check balances, dates, and overlapping requests.</p> : null}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setApplyingLeave(false)}>Cancel</Button>
              <Button disabled={applyMutation.isPending || !leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date} onClick={() => applyMutation.mutate(leaveForm)}>
                {applyMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </div>
        </DrawerPanel>
      </PageContainer>
    </AppLayout>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
