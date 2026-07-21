import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Clock3 } from "lucide-react";

import { AppLayout, EmptyState, LoadingSkeleton, PageContainer, PageHeader, SectionCard, StatusBadge } from "@/components/ui-system";
import { agentThemeFor } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";
import { getWorkflows } from "@/services/agents";

function commandFromWorkflow(workflow: Awaited<ReturnType<typeof getWorkflows>>[number]) {
  return workflow.messages.find((message) => message.type === "user_message")?.content ?? "Onboarding request";
}

function onboardingName(workflow: Awaited<ReturnType<typeof getWorkflows>>[number]) {
  const response = workflow.messages
    .map((message) => message.metadata?.structured_response as { candidate?: { name?: string }; draft?: { name?: string } } | undefined)
    .find((item) => item?.candidate?.name || item?.draft?.name);
  return response?.candidate?.name ?? response?.draft?.name ?? commandFromWorkflow(workflow).replace(/^(onboard|hire)\s+/i, "");
}

export function OnboardingPage() {
  const workflowsQuery = useQuery({ queryKey: ["onboarding-workflows"], queryFn: getWorkflows, refetchInterval: 15000 });
  const onboardingWorkflows = useMemo(
    () => (workflowsQuery.data ?? []).filter((workflow) => workflow.active_agent?.includes("onboarding")).slice(0, 12),
    [workflowsQuery.data],
  );
  const theme = agentThemeFor("onboarding_agent");

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Onboarding" description="Live onboarding workspace for employees created by the HR assistant." />
        {workflowsQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!workflowsQuery.isLoading && !onboardingWorkflows.length ? (
          <EmptyState icon={BadgeCheck} title="No onboarding workflows yet" description="Start onboarding from Agent Command and completed employees will appear here." />
        ) : null}
        {onboardingWorkflows.length ? (
          <SectionCard title="Recent Onboarding" description="Auto-refreshes as onboarding requests complete.">
            <div className="grid gap-3 lg:grid-cols-2">
              {onboardingWorkflows.map((workflow) => {
                const complete = workflow.status === "COMPLETED";
                return (
                  <div key={workflow.workflow_id} className={cn("rounded-lg border p-4 shadow-sm transition-colors", theme.soft)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : theme.icon)}>
                          {complete ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="font-semibold">{onboardingName(workflow)}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{commandFromWorkflow(workflow)}</p>
                        </div>
                      </div>
                      <StatusBadge status={complete ? "Completed" : "In progress"} tone={complete ? "success" : "info"} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ) : null}
      </PageContainer>
    </AppLayout>
  );
}
