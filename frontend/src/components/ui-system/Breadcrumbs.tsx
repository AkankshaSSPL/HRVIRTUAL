import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  "agent-command": "Agent Command",
  "audit-logs": "Audit Logs",
};

function toLabel(segment: string) {
  return labels[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function Breadcrumbs({ className }: { className?: string }) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  return (
    <nav className={cn("flex min-w-0 items-center gap-1 text-xs text-muted-foreground", className)} aria-label="Breadcrumb">
      <Link to="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
        Home
      </Link>
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const current = index === segments.length - 1;
        return (
          <span key={href} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            {current ? (
              <span className="truncate font-medium text-foreground">{toLabel(segment)}</span>
            ) : (
              <Link to={href} className="truncate hover:text-foreground">
                {toLabel(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

