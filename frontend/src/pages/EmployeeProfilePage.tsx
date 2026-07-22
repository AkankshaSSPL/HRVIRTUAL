import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmployeeEditDrawer } from "@/components/employees/EmployeeEditDrawer";
import { OnboardingProgressBar } from "@/components/employees/OnboardingProgressBar";
import { SeatingAllocationModal } from "@/components/employees/SeatingAllocationModal";
import { AppLayout, ConfirmDialog, EmployeeProfileDrawer, EmptyState, LoadingSkeleton, PageContainer, PageHeader } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { deactivateEmployee, getEmployee, getEmployeeOnboardingProgress, sendWelcomeKit, type OnboardingProgress } from "@/services/employees";

function OnboardingProgressPanel({
  progress,
  activeTab,
  onSelectStep,
  onOpenSeatAssignment,
  onSendWelcomeKit,
  sendingWelcomeKit,
}: {
  progress: OnboardingProgress;
  activeTab: string;
  onSelectStep: (tab: string) => void;
  onOpenSeatAssignment: () => void;
  onSendWelcomeKit: () => void;
  sendingWelcomeKit: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">Onboarding Progress</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.completed.length} of {progress.items.length} steps complete
          </p>
        </div>
        <span className="text-2xl font-bold tabular-nums text-primary">{progress.percent}%</span>
      </div>

      <div className="mt-3">
        <OnboardingProgressBar percent={progress.percent} />
      </div>

      <div className="relative mt-6">
        <div className="absolute left-0 right-0 top-[14px] h-0.5 bg-muted" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-0.5">
          {progress.items.map((item, index) => {
            const stepTab = item.tab;
            const isActive = stepTab === activeTab;

            function handleStepClick() {
              if (item.key === "seating") {
                onOpenSeatAssignment();
                return;
              }
              if (item.key === "welcome_mail") {
                if (progress.welcome_kit_ready && !item.complete) {
                  onSendWelcomeKit();
                }
                return;
              }
              onSelectStep(stepTab);
            }

            return (
              <button
                key={item.key}
                type="button"
                onClick={handleStepClick}
                className="flex flex-1 flex-col items-center text-center focus:outline-none"
              >
                <div
                  className={cn(
                    "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-card text-[11px] font-semibold transition-colors",
                    item.complete
                      ? "border-primary bg-primary text-primary-foreground"
                      : isActive
                        ? "border-primary text-primary"
                        : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60",
                  )}
                >
                  {item.complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <p className={cn("mt-1.5 max-w-[68px] text-[10px] font-medium leading-tight", isActive && "text-primary")}>{item.label}</p>
                <span className={cn("mt-0.5 text-[9px] font-semibold uppercase tracking-wide", item.complete ? "text-emerald-600" : "text-amber-600")}>
                  {item.complete ? "Completed" : "Pending"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {progress.welcome_kit_ready && !progress.items.find((item) => item.key === "welcome_mail")?.complete ? (
        <div className="mt-4 flex justify-end border-t pt-3">
          <Button size="sm" onClick={onSendWelcomeKit} disabled={sendingWelcomeKit}>
            {sendingWelcomeKit ? "Sending..." : "Send Welcome Mail"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

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
    <OnboardingProgressPanel
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