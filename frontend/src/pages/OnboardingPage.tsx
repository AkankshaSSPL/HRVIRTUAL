import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";

import { OnboardingProgressBar } from "@/components/employees/OnboardingProgressBar";
import { AppLayout, EmptyState, LoadingSkeleton, PageContainer, PageHeader, SectionCard } from "@/components/ui-system";
import { getEmployees } from "@/services/employees";

export function OnboardingPage() {
  const navigate = useNavigate();
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees, refetchInterval: 15000 });
  const inProgress = useMemo(
    () => (employeesQuery.data?.items ?? []).filter((employee) => (employee.onboarding_percent ?? 0) < 100),
    [employeesQuery.data],
  );

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Onboarding" description="Employees still working through the 7-step onboarding checklist." />
        {employeesQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!employeesQuery.isLoading && !inProgress.length ? (
          <EmptyState icon={BadgeCheck} title="No one is mid-onboarding" description="Newly created employees will appear here until all 7 steps are complete." />
        ) : null}
        {inProgress.length ? (
          <SectionCard title="In Progress" description="Auto-refreshes as onboarding steps complete. At 100% an employee moves to the Employees page.">
            <div className="grid gap-3 lg:grid-cols-2">
              {inProgress.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => navigate(`/employees/${employee.id}`)}
                  className="rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{employee.name ?? "Unnamed employee"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {employee.designation ?? "Employee"} · {employee.department ?? "Unassigned"}
                      </p>
                    </div>
                    <span className="text-lg font-bold tabular-nums text-primary">{employee.onboarding_percent ?? 0}%</span>
                  </div>
                  <div className="mt-3">
                    <OnboardingProgressBar percent={employee.onboarding_percent ?? 0} />
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </PageContainer>
    </AppLayout>
  );
}