import { Check, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-system/StatusBadge";
import { agentThemeFor, statusToneFor } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";

export type ApprovalItem = {
  id: string;
  module: string;
  action: string;
  requester: string;
  timestamp: string;
  status: string;
  payloadPreview: string;
};

type ApprovalCardProps = {
  approval: ApprovalItem;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onNeedsChanges?: (id: string) => void;
};

export function ApprovalCard({ approval, onApprove, onReject, onNeedsChanges }: ApprovalCardProps) {
  const theme = agentThemeFor("approval_agent");

  return (
    <article className={cn("rounded-lg border p-5 shadow-sm", theme.soft)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={approval.module} tone="warning" className={cn(theme.border, theme.tint, theme.text)} />
            <StatusBadge status={approval.status} tone={statusToneFor(approval.status)} />
          </div>
          <div>
            <h3 className="text-base font-semibold">{approval.action}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Requested by {approval.requester} · {approval.timestamp}
            </p>
          </div>
          <p className="rounded-md border bg-background/60 p-3 text-sm text-muted-foreground">{approval.payloadPreview}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNeedsChanges?.(approval.id)}>
            <RotateCcw className="h-4 w-4" />
            Needs Changes
          </Button>
          <Button variant="outline" size="sm" onClick={() => onReject?.(approval.id)}>
            <X className="h-4 w-4" />
            Reject
          </Button>
          <Button size="sm" onClick={() => onApprove?.(approval.id)}>
            <Check className="h-4 w-4" />
            Approve
          </Button>
        </div>
      </div>
    </article>
  );
}
