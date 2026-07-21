import { Bot, CalendarClock, Clock3, Landmark, Users } from "lucide-react";

import {
  AppLayout,
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/ui-system";

export function DashboardPage() {
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
