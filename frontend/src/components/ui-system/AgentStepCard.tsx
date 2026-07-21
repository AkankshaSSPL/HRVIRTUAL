import { CheckCircle2, Clock3, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/ui-system/StatusBadge";
import { agentThemeFor, statusToneFor } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";

export type AgentStep = {
  id: string;
  title: string;
  agent: string;
  status: "completed" | "running" | "waiting";
  description: string;
};

export function AgentStepCard({ step }: { step: AgentStep }) {
  const Icon = step.status === "completed" ? CheckCircle2 : step.status === "running" ? Loader2 : Clock3;
  const tone = statusToneFor(step.status);
  const theme = agentThemeFor(step.agent);

  return (
    <div className={cn("rounded-lg border p-4 shadow-sm", theme.soft)}>
      <div className="flex gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", theme.icon)}>
          <Icon className={step.status === "running" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{step.title}</p>
            <StatusBadge status={step.status} tone={tone} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{step.agent}</p>
          <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
        </div>
      </div>
    </div>
  );
}
