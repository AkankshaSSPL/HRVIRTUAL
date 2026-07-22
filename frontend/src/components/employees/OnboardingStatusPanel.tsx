import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OnboardingProgressBar } from "@/components/employees/OnboardingProgressBar";
import { cn } from "@/lib/utils";
import type { OnboardingProgress } from "@/services/employees";

/**
 * The 7-step onboarding status panel. Shared between the manual Employee Profile
 * page and the Agent Command chat so both render the identical progress bar +
 * numbered step dots. Callbacks are optional: pass what the context supports
 * (the chat may omit tab selection, the profile omits nothing).
 */
export function OnboardingStatusPanel({
  progress,
  activeTab,
  onSelectStep,
  onOpenSeatAssignment,
  onSendWelcomeKit,
  sendingWelcomeKit = false,
  showWelcomeButton = true,
}: {
  progress: OnboardingProgress;
  activeTab?: string;
  onSelectStep?: (tab: string) => void;
  onOpenSeatAssignment?: () => void;
  onSendWelcomeKit?: () => void;
  sendingWelcomeKit?: boolean;
  showWelcomeButton?: boolean;
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
                onOpenSeatAssignment?.();
                return;
              }
              if (item.key === "welcome_mail") {
                if (progress.welcome_kit_ready && !item.complete) {
                  onSendWelcomeKit?.();
                }
                return;
              }
              onSelectStep?.(stepTab);
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

      {showWelcomeButton && progress.welcome_kit_ready && !progress.items.find((item) => item.key === "welcome_mail")?.complete ? (
        <div className="mt-4 flex justify-end border-t pt-3">
          <Button size="sm" onClick={onSendWelcomeKit} disabled={sendingWelcomeKit}>
            {sendingWelcomeKit ? "Sending..." : "Send Welcome Mail"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
