import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bot, CalendarClock, Clock3, Landmark, Users } from "lucide-react";

import { OnboardingProgressBar } from "@/components/employees/OnboardingProgressBar";
import {
  AppLayout,
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/ui-system";
import { getEmployees } from "@/services/employees";

export function DashboardPage() {
  const navigate = useNavigate();
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees, refetchInterval: 15000 });
  const inProgress = useMemo(
    () => (employeesQuery.data?.items ?? []).filter((employee) => (employee.onboarding_percent ?? 0) < 100),
    [employeesQuery.data],
  );

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="Dashboard"
          description="Enterprise workforce operations overview with approval queues, agent execution signals, and HRMS module readiness."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Employees" value="Live" icon={Users} detail="Connects to employee data" />
          <StatCard label="Pending Approvals" value="Live" icon={Clock3} detail="Connects to approval queue" tone="warning" />
          <StatCard label="Active Agents" value="Ready" icon={Bot} detail="Orchestration available" tone="success" />
          <StatCard label="Payroll Pending" value="Pending" icon={Landmark} detail="Payroll agent not enabled" tone="warning" />
          <StatCard label="Employees On Leave" value="Pending" icon={CalendarClock} detail="Leave agent foundation ready" tone="neutral" />
        </div>
        <SectionCard title="Onboarding Progress" description="Employees still working through the 7-step onboarding checklist.">
          {!employeesQuery.isLoading && !inProgress.length ? (
            <EmptyState title="No one is mid-onboarding" description="Newly created employees will appear here until all 7 steps are complete." />
          ) : (
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
          )}
        </SectionCard>
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <SectionCard title="Recent Activities" description="Latest workforce and platform events.">
            <EmptyState title="No recent activity" description="Live activity will appear here when HR workflows run." />
          </SectionCard>
          <SectionCard title="Pending Approvals" description="Human review gates ready for the approval engine.">
            <EmptyState title="No pending approvals" description="Approval requests will appear here after governed actions are submitted." />
          </SectionCard>
        </div>
        <SectionCard title="Agent Activity Timeline" description="High-level execution track for future multi-agent workflows.">
          <EmptyState title="No agent activity yet" description="Runtime events will appear here after agent workflows are executed." />
        </SectionCard>
      </PageContainer>
    </AppLayout>
  );
}