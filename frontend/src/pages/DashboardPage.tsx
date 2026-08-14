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
import { apiGet } from "@/services/api";
import { getEmployees } from "@/services/employees";

type DashboardStats = {
  total_employees: number;
  pending_approvals: number;
  active_agents: number;
  payroll_pending: number;
  employees_on_leave: number;
};

function getDashboardStats() {
  return apiGet<DashboardStats>("/dashboard/stats");
}

function WelcomeBanner({ totalPresent = 45 }: { totalPresent?: number }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-xl bg-slate-800 px-6 py-8 text-white shadow-md">
      <div className="relative z-10 flex flex-col items-start gap-1">
        <p className="text-sm font-medium text-slate-300">Good afternoon,</p>
        <h1 className="text-3xl font-bold tracking-tight">HR</h1>
        <p className="mt-2 text-sm text-slate-400">Here's what's happening across your company today.</p>
        <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-600/50 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-emerald-400">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
          {totalPresent} present today
        </div>
      </div>
      {/* Decorative Glows */}
      <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl"></div>
      <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl"></div>
      
      {/* SVG Wave */}
      <svg
        className="absolute bottom-0 left-0 w-full text-slate-800/30"
        viewBox="0 0 1440 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          d="M0 120L48 106.7C96 93 192 67 288 64C384 61 480 85 576 96C672 107 768 107 864 90.7C960 75 1056 43 1152 37.3C1248 32 1344 53 1392 64L1440 74.7V120H1392C1344 120 1248 120 1152 120C1056 120 960 120 864 120C768 120 672 120 576 120C480 120 384 120 288 120C192 120 96 120 48 120H0Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees, refetchInterval: 15000 });
  const statsQuery = useQuery({ queryKey: ["dashboard-stats"], queryFn: getDashboardStats, refetchInterval: 15000 });
  
  const inProgress = useMemo(
    () => (employeesQuery.data?.items ?? []).filter((employee) => (employee.onboarding_percent ?? 0) < 100),
    [employeesQuery.data],
  );

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="Dashboard"
          description="Overview of your company stats, attendance, and recent activity."
        />
        <WelcomeBanner totalPresent={employeesQuery.data?.total ?? 45} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Employees" value={statsQuery.data?.total_employees ?? "..."} icon={Users} detail="Connects to employee data" />
          <StatCard label="Pending Approvals" value={statsQuery.data?.pending_approvals ?? "..."} icon={Clock3} detail="Connects to approval queue" tone="warning" />
          <StatCard label="Active Agents" value={statsQuery.data?.active_agents ?? "..."} icon={Bot} detail="Orchestration available" tone="success" />
          <StatCard label="Payroll Pending" value={statsQuery.data?.payroll_pending ?? "..."} icon={Landmark} detail="Payroll agent not enabled" tone="warning" />
          <StatCard label="Employees On Leave" value={statsQuery.data?.employees_on_leave ?? "..."} icon={CalendarClock} detail="Leave agent foundation ready" tone="neutral" />
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