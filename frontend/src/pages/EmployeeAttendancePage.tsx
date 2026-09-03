import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, Check, Flag, Home, Minus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { AppLayout, DrawerPanel, PageContainer, PageHeader, SectionCard, StatusBadge } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { getMyAttendanceMatrix, type AttendanceCell } from "@/services/attendance";
import { getLookups } from "@/services/lookups";

const statusStyles: Record<string, string> = {
  PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ABSENT: "border-rose-400 bg-rose-100 text-rose-700",
  HALF_DAY: "border-amber-400 bg-amber-100 text-amber-800",
  PAID_LEAVE: "border-violet-400 bg-violet-100 text-violet-700",
  UNPAID_LEAVE: "border-red-500 bg-red-100 text-red-700",
  WORK_FROM_HOME: "border-cyan-400 bg-cyan-100 text-cyan-800",
  HOLIDAY: "border-violet-200 bg-violet-50 text-violet-700",
  WEEKEND: "border-slate-400 bg-muted text-muted-foreground",
  MISSING: "border-zinc-200 bg-zinc-50 text-zinc-500",
};

function statusIcon(status: string) {
  if (status === "PRESENT") return <Check className="h-3.5 w-3.5" />;
  if (status === "ABSENT") return <X className="h-3.5 w-3.5" />;
  if (status === "PAID_LEAVE") return <Flag className="h-3.5 w-3.5 text-violet-700" />;
  if (status === "UNPAID_LEAVE") return <Flag className="h-3.5 w-3.5 fill-current" />;
  if (status === "WORK_FROM_HOME") return <Home className="h-3.5 w-3.5" />;
  if (status === "WEEKEND") return <Ban className="h-3.5 w-3.5" />;
  if (status === "MISSING") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function formatDayTotal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function EmployeeAttendancePage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [selectedCell, setSelectedCell] = useState<AttendanceCell | null>(null);

  const matrixQuery = useQuery({
    queryKey: ["my-attendance-matrix", month, year],
    queryFn: () => getMyAttendanceMatrix({ month, year }),
  });
  
  const lookupsQuery = useQuery({ 
    queryKey: ["lookups", "attendance-status"], 
    queryFn: () => getLookups(["attendance_status"]) 
  });
  
  const attendanceOptions = lookupsQuery.data?.attendance_status ?? [];
  const matrix = matrixQuery.data;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader 
          title="Attendance Records" 
          description="View and manage your monthly attendance records."
        />

        <SectionCard>
          <div className="flex gap-3">
            <Input type="number" value={month} onChange={(event) => setMonth(Number(event.target.value))} min={1} max={12} className="w-24" />
            <Input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} className="w-32" />
          </div>
        </SectionCard>

        <SectionCard>
          {matrixQuery.isError ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Attendance data could not be loaded. Please try again later.
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {attendanceOptions.map((item) => (
              <span key={item.id} className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs", statusStyles[item.code])}>
                {statusIcon(item.code)}
                {item.label}
              </span>
            ))}
          </div>

          <div className="overflow-auto rounded-lg border">
            <table className="min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="sticky left-0 z-20 w-56 border-r bg-muted px-3 py-2 text-left">Employee</th>
                  {matrix?.days.map((day) => (
                    <th key={day.date} className="w-11 border-r px-2 py-2 text-center">
                      <span className="block text-xs font-semibold">{day.day}</span>
                      <span className="text-[10px] text-muted-foreground">{day.weekday}</span>
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 w-20 border-l bg-muted px-3 py-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix?.rows.map((row) => (
                  <tr key={row.employee_id} className="h-14 border-t">
                    <td className="sticky left-0 z-10 border-r bg-card px-3 py-2">
                      <span className="font-medium">
                        {row.employee_name}
                      </span>
                      <p className="text-xs text-muted-foreground">{row.department} · {row.designation}</p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={`${row.employee_id}-${cell.date}`} className="border-r p-1 text-center">
                        <button
                          type="button"
                          title={`${cell.label} · ${cell.date}`}
                          onClick={() => setSelectedCell(cell)}
                          className={cn("mx-auto flex h-7 w-7 items-center justify-center rounded-md border transition hover:scale-105", statusStyles[cell.status] ?? statusStyles.MISSING)}
                        >
                          {statusIcon(cell.status)}
                        </button>
                      </td>
                    ))}
                    <td className="sticky right-0 border-l bg-card px-3 py-2 text-center">
                      <span className="text-sm font-semibold text-foreground">{formatDayTotal(row.payable_days)}</span>
                      <span className="text-sm text-muted-foreground">/{formatDayTotal(row.working_days)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!matrixQuery.isLoading && !matrixQuery.isError && !matrix?.rows.length ? <p className="p-6 text-center text-sm text-muted-foreground">No attendance records found.</p> : null}
          </div>
        </SectionCard>
      </PageContainer>

      <DrawerPanel open={Boolean(selectedCell)} title="Attendance Detail" size="md" onClose={() => setSelectedCell(null)}>
        {selectedCell ? (
          <div className="space-y-4">
            <div className={cn("rounded-lg border p-4", statusStyles[selectedCell.status])}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{selectedCell.employee_name}</h3>
                  <p className="mt-1 text-sm">{selectedCell.date}</p>
                </div>
                <StatusBadge status={selectedCell.status.replace(/_/g, " ")} tone="info" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Check In" value={selectedCell.check_in_time ?? "Not recorded"} />
              <Info label="Check Out" value={selectedCell.check_out_time ?? "Not recorded"} />
              <Info label="Working Hours" value={selectedCell.total_hours ? `${selectedCell.total_hours}h` : "Not available"} />
              <Info label="Shift" value="Default Shift" />
            </div>
          </div>
        ) : null}
      </DrawerPanel>
    </AppLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
