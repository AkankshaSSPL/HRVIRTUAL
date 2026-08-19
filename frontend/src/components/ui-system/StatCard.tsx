import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | React.ReactNode;
  icon: LucideIcon;
  detail?: string;
  tone?: "emerald" | "blue" | "purple" | "amber" | "orange";
};

const palettes = {
  emerald: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-700",
  },
  blue: {
    iconBg: "bg-blue-50",
    iconText: "text-blue-700",
  },
  purple: {
    iconBg: "bg-purple-50",
    iconText: "text-purple-700",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-700",
  },
  orange: {
    iconBg: "bg-orange-50",
    iconText: "text-orange-700",
  },
};

export function StatCard({ label, value, icon: Icon, detail, tone = "blue" }: StatCardProps) {
  const palette = palettes[tone];

  return (
    <div className={cn("relative flex flex-col justify-between rounded-xl border bg-card p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md")}>
      <div className="flex items-start justify-between">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", palette.iconBg, palette.iconText)}>
          <Icon className="h-6 w-6" />
        </div>
        <ArrowUpRight className={cn("h-5 w-5 text-muted-foreground")} />
      </div>
      <div className="mt-8">
        <p className={cn("text-sm font-medium text-muted-foreground")}>{label}</p>
        <p className={cn("mt-1 text-3xl font-bold tracking-tight text-foreground")}>{value}</p>
        {detail ? (
          <div className={cn("mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground")}>
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}
