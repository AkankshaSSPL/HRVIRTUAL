import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Send, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppLayout,
  EmptyState,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/ui-system";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { applyMyLeave, getLeavePolicies, getMyLeaveWorkspace, type LeaveRequest } from "@/services/leave";
import { useAuthStore } from "@/stores/authStore";
import toast from "react-hot-toast";

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

export function EmployeeLeavePage() {
  const queryClient = useQueryClient();
  const [applyingLeave, setApplyingLeave] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [leaveForm, setLeaveForm] = useState({ leave_type: "Casual Leave", start_date: "", end_date: "", reason: "", whom_to_send: "" });

  const { user } = useAuthStore();

  const workspaceQuery = useQuery({
    queryKey: ["my-leave-workspace", selectedYear],
    queryFn: () => getMyLeaveWorkspace(selectedYear),
  });
  
  const workspace = workspaceQuery.data;
  
  const policiesQuery = useQuery({ queryKey: ["leave-policies"], queryFn: getLeavePolicies, enabled: applyingLeave });
  const applyMutation = useMutation({
    mutationFn: applyMyLeave,
    onSuccess: async () => {
        toast.success("Applied successfully");
      await queryClient.invalidateQueries({ queryKey: ["my-leave-workspace"] });
      setApplyingLeave(false);
      setLeaveForm({ leave_type: "Casual Leave", start_date: "", end_date: "", reason: "", whom_to_send: "" });
    },
  });

  return (
    <AppLayout>
      <PageContainer>
        {/* Header Section */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">My Leave</h1>
            <p className="text-sm text-muted-foreground mt-1">View your leave balances and request time off.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            >
              <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
              <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
              <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
            </select>
            <Button onClick={() => setApplyingLeave(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm">
              <Send className="h-4 w-4 mr-2" />
              Apply Leave
            </Button>
          </div>
        </div>

        {workspaceQuery.isLoading ? <LoadingSkeleton rows={7} /> : null}
        {workspaceQuery.isError ? (
          <EmptyState
            title="Unable to load leave data"
            description="Your leave workspace could not be retrieved. Check that the backend is running, then refresh."
            actionLabel="Try again"
            onAction={() => workspaceQuery.refetch()}
          />
        ) : null}

        {workspace ? (
          <div className="flex flex-col gap-8 items-start w-full">
            
            {/* User Card & Leave Balances */}
            <div className="w-full max-w-md">
               <div className="rounded-xl border bg-card shadow-sm overflow-hidden sticky top-6">
                  {/* User Profile Header */}
                  <div className="p-4 border-b bg-muted/50 flex items-center gap-3">
                     <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-foreground font-bold text-base uppercase shadow-sm">
                       {user?.full_name?.[0] || "E"}
                     </div>
                     <div>
                       <div className="font-semibold text-foreground text-sm leading-tight">{user?.full_name}</div>
                     </div>
                  </div>
                  
                  {/* Leave Balances Table */}
                  <div className="p-0">
                     <table className="w-full text-xs">
                       <thead>
                         <tr className="border-b bg-card text-left">
                           <th className="px-4 py-3 font-semibold text-foreground">Leave Type</th>
                           <th className="px-2 py-3 text-center font-semibold text-foreground">Total</th>
                           <th className="px-2 py-3 text-center font-semibold text-rose-500">Used</th>
                           <th className="px-4 py-3 text-right font-semibold text-emerald-600">Available</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-border">
                         {workspace.balances.map((balance) => (
                           <tr key={balance.leave_type_id ?? balance.leave_type} className="hover:bg-muted/50 transition-colors bg-card">
                             <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{balance.leave_type}</td>
                             <td className="px-2 py-2.5 text-center text-muted-foreground">{balance.allocated}</td>
                             <td className="px-2 py-2.5 text-center font-medium text-rose-500">{balance.used}</td>
                             <td className="px-4 py-2.5 text-right">
                               <div className="flex items-center justify-end gap-1.5">
                                 <span className="font-bold text-emerald-600">{balance.remaining}</span>
                                 <Info className="h-3 w-3 text-muted-foreground" />
                               </div>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                     {!workspace.balances.length && (
                        <p className="p-4 text-center text-xs text-muted-foreground bg-card">
                          No leave balances assigned to your account.
                        </p>
                     )}
                  </div>
               </div>
            </div>

            {/* Leave History */}
            <div className="w-full">
              <div className="mb-4">
                <h2 className="text-base font-bold text-foreground">My Leave History</h2>
                <p className="text-sm text-muted-foreground mt-1">Your past and upcoming leave requests.</p>
              </div>
              <div className="flex flex-col gap-3">
                  {workspace.history.map((request) => (
                    <div key={request.id} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 overflow-hidden">
                        <div className="min-w-[140px]">
                          <p className="font-bold text-foreground">{request.leave_type}</p>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{requestDate(request)}</span>
                        </div>
                        
                        <p className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md border border-border whitespace-nowrap">
                          {request.total_days} working day{request.total_days === 1 ? "" : "s"}
                        </p>
                        
                        {request.reason ? (
                            <p className="text-xs italic text-muted-foreground truncate flex-1 ml-0 sm:ml-2">"{request.reason}"</p>
                        ) : null}
                      </div>
                      
                      <StatusBadge status={request.status} tone={requestTone(request.status)} className="rounded-sm px-2 uppercase tracking-wide border whitespace-nowrap self-start sm:self-center" />
                    </div>
                  ))}
                  {!workspace.history.length ? (
                    <div className="w-full">
                      <EmptyState title="No leave history" description="You have not requested any leave yet." />
                    </div>
                  ) : null}
                </div>
            </div>
            
          </div>
        ) : null}

        <Dialog open={applyingLeave} onOpenChange={setApplyingLeave}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Add New Leave Application</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <FormField label="Leave Type">
                <select className="h-11 w-full rounded-lg border-gray-300 bg-background px-3 text-sm focus:border-emerald-500 focus:ring-emerald-500 shadow-sm border" value={leaveForm.leave_type} onChange={(event) => setLeaveForm((current) => ({ ...current, leave_type: event.target.value }))}>
                  {(policiesQuery.data ?? []).map((policy) => <option key={policy.id} value={policy.name}>{policy.name}{policy.affects_payroll ? " · Payroll impact" : ""}</option>)}
                </select>
              </FormField>
              
              <FormField label="Start Date">
                <Input type="date" className="h-11 shadow-sm border-gray-300" value={leaveForm.start_date} onChange={(event) => setLeaveForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date || event.target.value }))} />
              </FormField>
              
              <FormField label="End Date">
                <Input type="date" className="h-11 shadow-sm border-gray-300" value={leaveForm.end_date} onChange={(event) => setLeaveForm((current) => ({ ...current, end_date: event.target.value }))} />
              </FormField>
              
              <FormField label="Reason">
                <textarea placeholder="e.g. Family emergency, Medical appointment..." className="min-h-[100px] w-full rounded-lg border-gray-300 border bg-background px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm resize-y" value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} />
              </FormField>
              
              <FormField label="Whom to Send (Approver)">
                <select className="h-11 w-full rounded-lg border-gray-300 bg-background px-3 text-sm focus:border-emerald-500 focus:ring-emerald-500 shadow-sm border" value={leaveForm.whom_to_send} onChange={(event) => setLeaveForm((current) => ({ ...current, whom_to_send: event.target.value }))}>
                  <option value="">Select Approver</option>
                  <option value="HR Department">HR Department</option>
                  <option value="Direct Manager">Direct Manager</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </FormField>
              
              {applyMutation.isError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-medium text-rose-800">Leave request could not be submitted.</p>
                  <p className="text-xs text-rose-600 mt-1">
                    {applyMutation.error instanceof Error ? applyMutation.error.message : "Please check the dates and your available balance."}
                  </p>
                </div>
              ) : null}
              
              <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                <Button variant="outline" className="h-10 px-6 font-medium shadow-sm" onClick={() => setApplyingLeave(false)}>Cancel</Button>
                <Button className="h-10 px-6 font-medium bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm" disabled={applyMutation.isPending || !leaveForm.start_date || !leaveForm.end_date} onClick={() => applyMutation.mutate(leaveForm)}>
                  {applyMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </AppLayout>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-foreground">{label} <span className="text-red-500">*</span></span>
      {children}
    </label>
  );
}
