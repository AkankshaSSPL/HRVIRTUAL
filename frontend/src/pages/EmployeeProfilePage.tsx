import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmployeeEditDrawer } from "@/components/employees/EmployeeEditDrawer";
import { OnboardingStatusPanel } from "@/components/employees/OnboardingStatusPanel";
import { SeatingAllocationModal } from "@/components/employees/SeatingAllocationModal";
import { AppLayout, ConfirmDialog, EmployeeProfileDrawer, EmptyState, LoadingSkeleton, PageContainer, PageHeader } from "@/components/ui-system";
import { deactivateEmployee, getEmployee, getEmployeeOnboardingProgress, sendWelcomeKit } from "@/services/employees";

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [activeTab, setActiveTab] = useState("Personal");
  const [seatModalOpen, setSeatModalOpen] = useState(false);

  const employeeQuery = useQuery({
    queryKey: ["employee", id],
    queryFn: () => getEmployee(id!),
    enabled: Boolean(id),
  });

  const progressQuery = useQuery({
    queryKey: ["employee-onboarding-progress", id],
    queryFn: () => getEmployeeOnboardingProgress(id!),
    enabled: Boolean(id),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateEmployee,
    onSuccess: async () => {
      setConfirmingDeactivate(false);
      await queryClient.invalidateQueries({ queryKey: ["employee", id] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const welcomeKitMutation = useMutation({
    mutationFn: sendWelcomeKit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employee-onboarding-progress", id] });
    },
  });

  const employee = employeeQuery.data;
  const progress = progressQuery.data;

  const progressHeader = progress ? (
    <OnboardingStatusPanel
      progress={progress}
      activeTab={activeTab}
      onSelectStep={setActiveTab}
      onOpenSeatAssignment={() => setSeatModalOpen(true)}
      onSendWelcomeKit={() => id && welcomeKitMutation.mutate(id)}
      sendingWelcomeKit={welcomeKitMutation.isPending}
    />
  ) : progressQuery.isLoading ? (
    <LoadingSkeleton rows={2} />
  ) : null;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title={employee?.name ?? "Employee Profile"}
          description={employee ? `${employee.designation ?? "Employee"} · ${employee.department ?? "Unassigned"}` : "Loading employee record..."}
          actions={
            <Button variant="outline" onClick={() => navigate("/employees")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Employees
            </Button>
          }
        />
        {employeeQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}
        {employeeQuery.isError ? (
          <EmptyState title="Unable to load employee" description="This employee record could not be retrieved." />
        ) : null}
        {employee ? (
          <EmployeeProfileDrawer
            open
            employee={employee}
            onClose={() => navigate("/employees")}
            onUpdate={(item) => setEditingEmployeeId(item.id ?? null)}
            onDeactivate={() => setConfirmingDeactivate(true)}
            extraHeader={progressHeader}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        ) : null}
        <EmployeeEditDrawer employeeId={editingEmployeeId} open={Boolean(editingEmployeeId)} onClose={() => setEditingEmployeeId(null)} />
        {id ? (
          <SeatingAllocationModal
            open={seatModalOpen}
            employeeId={id}
            currentSeat={employee?.seat_label}
            onClose={() => setSeatModalOpen(false)}
          />
        ) : null}
        <ConfirmDialog
          open={confirmingDeactivate}
          title="Deactivate employee?"
          description={`${employee?.name ?? "This employee"} will be marked inactive. Their record and history remain visible everywhere else in the system.`}
          confirmLabel={deactivateMutation.isPending ? "Deactivating..." : "Deactivate Employee"}
          onCancel={() => setConfirmingDeactivate(false)}
          onConfirm={() => {
            if (id) deactivateMutation.mutate(id);
          }}
        />
      </PageContainer>
    </AppLayout>
  );
}