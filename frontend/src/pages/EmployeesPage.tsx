import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, RefreshCw, Trash2, UserRoundCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmployeeCreateWizard } from "@/components/employees/EmployeeCreateWizard";
import { EmployeeEditDrawer } from "@/components/employees/EmployeeEditDrawer";
import { AppLayout, ConfirmDialog, DataTable, EmptyState, LoadingSkeleton, PageContainer, PageHeader, StatusBadge, ToastNotification } from "@/components/ui-system";
import { deleteEmployee, getEmployees, type EmployeeRecord } from "@/services/employees";

const columns: ColumnDef<EmployeeRecord>[] = [
  {
    accessorKey: "name",
    header: "Employee",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2 font-medium">
        <UserRoundCheck className="h-4 w-4 text-secondary" />
        <span>
          {row.original.name ?? "Unnamed employee"}
          <span className="block text-xs font-normal text-muted-foreground">{row.original.official_email ?? row.original.employee_code}</span>
        </span>
      </span>
    ),
  },
  { accessorKey: "department", header: "Department", cell: ({ row }) => row.original.department ?? "Unassigned" },
  { accessorKey: "designation", header: "Designation", cell: ({ row }) => row.original.designation ?? "Employee" },
  { accessorKey: "manager", header: "Manager", cell: ({ row }) => row.original.manager ?? "Unassigned" },
  { accessorKey: "employment_type", header: "Employment Type", cell: ({ row }) => (row.original.employment_type ?? "FULL_TIME").replace(/_/g, " ") },
  { accessorKey: "joining_date", header: "Joining", cell: ({ row }) => row.original.joining_date ?? "Not set" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge
        status={(row.original.status ?? "ACTIVE").replace("_", " ")}
        tone={row.original.status === "ACTIVE" ? "success" : row.original.status === "PROBATION" ? "info" : "warning"}
      />
    ),
  },
];

export function EmployeesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<EmployeeRecord | null>(null);
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees, refetchInterval: 15000 });
  const deleteMutation = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: async () => {
      setDeletingEmployee(null);
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
  const employees = useMemo(
    () => (employeesQuery.data?.items ?? []).filter((employee) => (employee.onboarding_percent ?? 0) === 100),
    [employeesQuery.data],
  );
  const latestEmployee = useMemo(() => employees[0], [employees]);

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="Employees"
          description="Live employee workspace for onboarded employees, status updates, and HR records."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => employeesQuery.refetch()} disabled={employeesQuery.isFetching}>
                <RefreshCw className={`h-4 w-4 ${employeesQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={() => setCreatingEmployee(true)}>
                <Plus className="h-4 w-4" />
                Employee
              </Button>
            </div>
          }
        />
        {employeesQuery.isFetching && !employeesQuery.isLoading ? (
          <div className="fixed bottom-6 right-6 z-50">
            <ToastNotification title="Employee workspace refreshing" description="Latest onboarding and employee updates are being loaded." type="info" />
          </div>
        ) : null}
        {latestEmployee ? (
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Latest employee record</p>
                <p className="mt-1 text-sm text-muted-foreground">{latestEmployee.name ?? "Unnamed employee"} · {latestEmployee.designation ?? "Employee"} · {latestEmployee.department ?? "Unassigned"}</p>
              </div>
              <StatusBadge status={(latestEmployee.status ?? "ACTIVE").replace("_", " ")} tone={latestEmployee.status === "ACTIVE" ? "success" : "info"} />
            </div>
          </div>
        ) : null}
        {employeesQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}
        {employeesQuery.isError ? <EmptyState title="Unable to load employees" description="The employee directory could not be retrieved." /> : null}
        {!employeesQuery.isLoading && !employeesQuery.isError ? (
          <DataTable
            data={employees}
            columns={columns}
            getRowId={(row) => row.id}
            searchPlaceholder="Search employees, departments, managers"
            renderRowActions={(employee) => (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="View employee profile" onClick={() => navigate(`/employees/${employee.id}`)}><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Edit employee" onClick={() => setEditingEmployeeId(employee.id)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete employee" onClick={() => setDeletingEmployee(employee)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
              </div>
            )}
          />
        ) : null}
        <EmployeeCreateWizard open={creatingEmployee} onClose={() => setCreatingEmployee(false)} />
        <EmployeeEditDrawer employeeId={editingEmployeeId} open={Boolean(editingEmployeeId)} onClose={() => setEditingEmployeeId(null)} />
        <ConfirmDialog
          open={Boolean(deletingEmployee)}
          title="Delete employee record?"
          description={`${deletingEmployee?.name ?? "This employee"} will be removed from active HRMS views. Historical audit data will be retained.`}
          confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete Employee"}
          onCancel={() => setDeletingEmployee(null)}
          onConfirm={() => deletingEmployee && deleteMutation.mutate(deletingEmployee.id)}
        />
      </PageContainer>
    </AppLayout>
  );
}