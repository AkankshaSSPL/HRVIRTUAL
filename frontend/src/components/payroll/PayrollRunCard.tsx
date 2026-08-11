import { cn } from "@/lib/utils";
import { useAgentTheme } from "@/lib/agent-theme";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-system/StatusBadge";
import { Download, FileSpreadsheet, CheckCircle, Clock, X, Eye } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPayrollLopAudit, type LopAuditRecord } from "@/services/payroll";

interface PayrollRunCardProps {
  runId: string;
  month: string; // "July 2026"
  status: string; // "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "BANK_SHEET_GENERATED" | "COMPLETED"
  employeeCount: number;
  skipped?: string[];
  exportsLocked: boolean;
  onExport: (type: "employee" | "consultant" | "bank" | "tds") => void;
  onSubmitApproval?: () => void; // undefined hides the button
  onDismiss?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "error" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Pending Approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  BANK_SHEET_GENERATED: { label: "Bank Sheet Sent", tone: "success" },
  COMPLETED: { label: "Completed", tone: "success" },
};

export function PayrollRunCard({
  runId,
  month,
  status,
  employeeCount,
  skipped = [],
  exportsLocked,
  onExport,
  onSubmitApproval,
  onDismiss,
}: PayrollRunCardProps) {
  const theme = useAgentTheme("payroll");
  const statusInfo = STATUS_LABELS[status] ?? { label: status, tone: "neutral" };
  const [lopOpen, setLopOpen] = useState(false);
  const [lopFilter, setLopFilter] = useState<"ALL" | "EMPLOYEE" | "CONSULTANT">("ALL");
  const canReviewLop = true;
  const lopQuery = useQuery({
    queryKey: ["lop-audit", runId, lopFilter],
    queryFn: () => getPayrollLopAudit(runId, lopFilter),
    enabled: lopOpen,
  });

  const exports = [
    { type: "employee" as const, label: "Employee Sheet" },
    { type: "consultant" as const, label: "Consultant Sheet" },
    { type: "tds" as const, label: "TDS Sheet" },
    { type: "bank" as const, label: "Bank Sheet", requiresApproval: true },
  ];

  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)} data-run-id={runId}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", theme.icon)}>
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold">{month} Payroll</p>
            <p className="text-xs text-muted-foreground">{employeeCount} employees processed</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={statusInfo.label} tone={statusInfo.tone} />
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {skipped.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="font-medium">Skipped ({skipped.length}):</span> {skipped.join(", ")}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Export Sheets</p>
        <div className="flex flex-wrap gap-2">
          {exports.map((exp) => {
            const locked = Boolean(exp.requiresApproval) && exportsLocked;
            return (
              <Button
                key={exp.type}
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() => !locked && onExport(exp.type)}
                className={cn(locked && "opacity-40")}
              >
                <Download className="h-3 w-3 mr-1.5" />
                {exp.label}
                {locked && (
                  <span className="ml-1.5 rounded-sm bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    Needs Approval
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {status === "DRAFT" && onSubmitApproval && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Review payroll and submit to finance for approval.
          </p>
          <Button size="sm" onClick={onSubmitApproval}>
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            Submit for Approval
          </Button>
        </div>
      )}

      {status === "PENDING_APPROVAL" && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Awaiting finance approval. Bank sheet will unlock after approval.
        </div>
      )}

      {canReviewLop && (
        <div className="border-t pt-3">
          <Button size="sm" variant="outline" onClick={() => setLopOpen(!lopOpen)}>
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            {lopOpen ? "Hide LOP Details" : "Review Leaves & LOP"}
          </Button>
          {lopOpen && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-1">
                <Button size="sm" variant={lopFilter === "ALL" ? "default" : "outline"} onClick={() => setLopFilter("ALL")} className="h-7 text-xs px-2">All</Button>
                <Button size="sm" variant={lopFilter === "EMPLOYEE" ? "default" : "outline"} onClick={() => setLopFilter("EMPLOYEE")} className="h-7 text-xs px-2">Employees</Button>
                <Button size="sm" variant={lopFilter === "CONSULTANT" ? "default" : "outline"} onClick={() => setLopFilter("CONSULTANT")} className="h-7 text-xs px-2">Consultants</Button>
              </div>
              <div className="rounded-md border overflow-auto max-h-64">
              {lopQuery.isLoading ? (
                <p className="p-3 text-xs text-muted-foreground">Loading LOP details…</p>
              ) : !lopQuery.data?.length ? (
                <p className="p-3 text-xs text-muted-foreground">No employees in this run.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Employee</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Working</th>
                      <th className="px-3 py-2 text-right font-medium">Worked</th>
                      <th className="px-3 py-2 text-right font-medium">LOP</th>
                      <th className="px-3 py-2 text-right font-medium">Net Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lopQuery.data.map((item) => (
                      <tr key={item.employee_id} className="border-t">
                        <td className="px-3 py-2 font-medium">{item.employee_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.employment_type}</td>
                        <td className="px-3 py-2 text-right">{item.working_days}</td>
                        <td className="px-3 py-2 text-right">{item.days_worked}</td>
                        <td className={`px-3 py-2 text-right font-medium ${item.lop_days > 0 ? "text-rose-600" : ""}`}>{item.lop_days}</td>
                        <td className="px-3 py-2 text-right font-medium">₹{item.net_salary.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}