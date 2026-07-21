import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, Check, Flag, Home, Minus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout, DrawerPanel, EmployeeProfileDrawer, PageContainer, PageHeader, SectionCard, StatusBadge } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { getAttendanceDashboard, getAttendanceMatrix, updateAttendanceCell, type AttendanceCell, type AttendanceMatrixRow } from "@/services/attendance";
import { getLookups } from "@/services/lookups";

const statusStyles: Record<string, string> = {
  PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ABSENT: "border-rose-400 bg-rose-100 text-rose-700",
  HALF_DAY: "border-amber-400 bg-amber-100 text-amber-800",
  PAID_LEAVE: "border-violet-400 bg-violet-100 text-violet-700",
  UNPAID_LEAVE: "border-red-500 bg-red-100 text-red-700",
  WORK_FROM_HOME: "border-cyan-400 bg-cyan-100 text-cyan-800",
  HOLIDAY: "border-violet-200 bg-violet-50 text-violet-700",
  WEEKEND: "border-slate-400 bg-slate-200 text-slate-600",
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

export function AttendancePage() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [employee, setEmployee] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [viewMode, setViewMode] = useState<"matrix" | "calendar">("matrix");
  const [selectedCell, setSelectedCell] = useState<AttendanceCell | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<AttendanceMatrixRow | null>(null);
  const [remarks, setRemarks] = useState("");

  const matrixQuery = useQuery({
    queryKey: ["attendance-matrix", month, year, employee, department, status, page, pageSize],
    queryFn: () => getAttendanceMatrix({ month, year, employee, department, status, page, page_size: pageSize }),
  });
  const lookupsQuery = useQuery({ queryKey: ["lookups", "attendance-status"], queryFn: () => getLookups(["attendance_status"]) });
  const attendanceOptions = lookupsQuery.data?.attendance_status ?? [];
  const dashboardQuery = useQuery({ queryKey: ["attendance-dashboard"], queryFn: getAttendanceDashboard });
  const matrix = matrixQuery.data;

  const updateMutation = useMutation({
    mutationFn: (payload: { employee_id: string; attendance_date: string; status: string; remarks?: string }) => updateAttendanceCell(payload),
    onSuccess: async () => {
      setSelectedCell(null);
      await queryClient.invalidateQueries({ queryKey: ["attendance-matrix"] });
      await queryClient.invalidateQueries({ queryKey: ["attendance-dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-attendance-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-payroll-impact"] });
    },
  });

  const metricCards = useMemo(
    () => [
      ["Present Today", dashboardQuery.data?.present_today ?? 0, "PRESENT"],
      ["Absent Today", dashboardQuery.data?.absent_today ?? 0, "ABSENT"],
      ["WFH Today", dashboardQuery.data?.wfh_today ?? 0, "WORK_FROM_HOME"],
      ["Missing Attendance", dashboardQuery.data?.missing_attendance ?? 0, "MISSING"],
      ["Pending Regularizations", dashboardQuery.data?.pending_regularizations ?? 0, "HALF_DAY"],
    ],
    [dashboardQuery.data],
  );

  const calendarDays = useMemo(() => {
    return (matrix?.days ?? []).map((day) => ({
      ...day,
      cells: (matrix?.rows ?? []).flatMap((row) =>
        row.cells
          .filter((cell) => cell.date === day.date)
          .map((cell) => ({ ...cell, employee_name: row.employee_name })),
      ),
    }));
  }, [matrix]);

  function mark(statusValue: string) {
    if (!selectedCell) return;
    updateMutation.mutate({
      employee_id: selectedCell.employee_id,
      attendance_date: selectedCell.date,
      status: statusValue,
      remarks: remarks || `Marked ${statusValue.replace(/_/g, " ").toLowerCase()} from Attendance Matrix`,
    });
  }

  function resetPage(next: () => void) {
    setPage(1);
    next();
  }

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Attendance" description="Workforce attendance matrix, calendars, live exceptions, and payroll-ready monthly summaries." />

        <div className="grid gap-3 lg:grid-cols-5">
          {metricCards.map(([label, value, statusKey]) => (
            <SectionCard key={String(label)} className={cn("border", statusStyles[String(statusKey)])}>
              <p className="text-xs font-medium uppercase opacity-75">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{String(value)}</p>
            </SectionCard>
          ))}
        </div>

        <SectionCard>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_120px_120px_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Employee" value={employee} onChange={(event) => resetPage(() => setEmployee(event.target.value))} />
            </div>
            <Input placeholder="Department" value={department} onChange={(event) => resetPage(() => setDepartment(event.target.value))} />
            <Input type="number" value={month} onChange={(event) => resetPage(() => setMonth(Number(event.target.value)))} min={1} max={12} />
            <Input type="number" value={year} onChange={(event) => resetPage(() => setYear(Number(event.target.value)))} />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => resetPage(() => setStatus(event.target.value))}>
              <option value="">All statuses</option>
              {attendanceOptions.map((item) => <option key={item.id} value={item.code}>{item.label}</option>)}
            </select>
          </div>
        </SectionCard>

        <SectionCard>
          {matrixQuery.isError ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Attendance data could not be loaded. Please restart the backend and refresh this page.
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

          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-md border bg-muted/40 p-1">
              <Button size="sm" variant={viewMode === "matrix" ? "default" : "ghost"} onClick={() => setViewMode("matrix")}>
                Matrix
              </Button>
              <Button size="sm" variant={viewMode === "calendar" ? "default" : "ghost"} onClick={() => setViewMode("calendar")}>
                Calendar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {viewMode === "calendar" ? "Calendar shows the current paged employees." : "Matrix shows employees by day."}
            </p>
          </div>

          {viewMode === "matrix" ? (
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
                      <button type="button" className="font-medium hover:text-primary hover:underline" onClick={() => setSelectedEmployee(row)}>
                        {row.employee_name}
                      </button>
                      <p className="text-xs text-muted-foreground">{row.department} · {row.designation}</p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={`${row.employee_id}-${cell.date}`} className="border-r p-1 text-center">
                        <button
                          type="button"
                          title={`${cell.label} · ${cell.date}`}
                          onClick={() => { setSelectedCell(cell); setRemarks(cell.remarks ?? ""); }}
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
            {!matrixQuery.isLoading && !matrixQuery.isError && !matrix?.rows.length ? <p className="p-6 text-center text-sm text-muted-foreground">No employees match these attendance filters.</p> : null}
          </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              {calendarDays.map((day) => {
                const leaveCells = day.cells.filter((cell) => ["PAID_LEAVE", "UNPAID_LEAVE", "WORK_FROM_HOME"].includes(cell.status));
                const displayCells = leaveCells.length ? leaveCells : day.cells.slice(0, 3);
                return (
                  <div key={day.date} className="min-h-36 rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{day.day}</p>
                        <p className="text-xs text-muted-foreground">{day.weekday}</p>
                      </div>
                      <StatusBadge status={`${leaveCells.length || day.cells.length} records`} tone={leaveCells.length ? "warning" : "neutral"} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {displayCells.map((cell) => (
                        <button
                          key={`${cell.employee_id}-${cell.date}`}
                          type="button"
                          onClick={() => { setSelectedCell(cell); setRemarks(cell.remarks ?? ""); }}
                          className={cn("w-full rounded-md border px-2 py-1 text-left text-xs", statusStyles[cell.status] ?? statusStyles.MISSING)}
                        >
                          <span className="block font-medium">{cell.employee_name}</span>
                          <span>{cell.label}</span>
                        </button>
                      ))}
                      {!displayCells.length ? <p className="text-xs text-muted-foreground">No employees on this page.</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {matrix?.rows.length ?? 0} of {matrix?.pagination.total_rows ?? 0} employees
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={pageSize}
                onChange={(event) => {
                  setPage(1);
                  setPageSize(Number(event.target.value));
                }}
              >
                {[5, 10, 20, 50].map((size) => <option key={size} value={size}>{size} / page</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={page <= 1 || matrixQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Previous
              </Button>
              <span className="min-w-20 text-center text-sm text-muted-foreground">
                Page {matrix?.pagination.page ?? page} of {matrix?.pagination.total_pages ?? 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= (matrix?.pagination.total_pages ?? 1) || matrixQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </SectionCard>
      </PageContainer>

      <DrawerPanel open={Boolean(selectedCell)} title="Attendance Detail" size="2xl" onClose={() => setSelectedCell(null)}>
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
            <textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" placeholder="Remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button size="sm" onClick={() => mark("PRESENT")}>Mark Present</Button>
              <Button size="sm" variant="outline" onClick={() => mark("WORK_FROM_HOME")}>Mark WFH</Button>
              <Button size="sm" variant="outline" onClick={() => mark("HALF_DAY")}>Half Day</Button>
              <Button size="sm" variant="outline" onClick={() => mark("ABSENT")}>Mark Absent</Button>
              <Button size="sm" variant="ghost" onClick={() => mark("PRESENT")}>Regularize</Button>
            </div>
          </div>
        ) : null}
      </DrawerPanel>
      <EmployeeProfileDrawer
        open={Boolean(selectedEmployee)}
        employee={selectedEmployee ? {
          id: selectedEmployee.employee_id,
          name: selectedEmployee.employee_name,
          department: selectedEmployee.department,
          designation: selectedEmployee.designation,
          status: selectedEmployee.status,
          employment_type: selectedEmployee.employment_type,
        } : null}
        initialTab="Attendance"
        attendanceMonth={month}
        attendanceYear={year}
        onClose={() => setSelectedEmployee(null)}
      />
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
