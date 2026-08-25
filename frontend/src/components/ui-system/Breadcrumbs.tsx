import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { getEmployee } from "@/services/employees";
import { getRole } from "@/services/system";

const labels: Record<string, string> = {
  "agent-command": "Agent Command",
  "audit-logs": "Audit Logs",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toLabel(segment: string) {
  return labels[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function Breadcrumbs({ className }: { className?: string }) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  // /employees/:id[...] — resolve the id segment to the employee's name
  // instead of showing the raw UUID. Shares the profile page's query key,
  // so this is served from cache once the employee has been fetched once.
  const employeeIdSegment =
    segments[0] === "employees" && segments[1] && UUID_RE.test(segments[1]) ? segments[1] : undefined;

  const employeeQuery = useQuery({
    queryKey: ["employee", employeeIdSegment],
    queryFn: () => getEmployee(employeeIdSegment!),
    enabled: Boolean(employeeIdSegment),
    staleTime: 5 * 60 * 1000,
  });

  // /system-users/roles/:id[...] — resolve the role ID to the role's name
  const roleIdSegment =
    segments[1] === "roles" && segments[2] && UUID_RE.test(segments[2]) ? segments[2] : undefined;

  const roleQuery = useQuery({
    queryKey: ["roles", roleIdSegment],
    queryFn: () => getRole(roleIdSegment!),
    enabled: Boolean(roleIdSegment),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <nav className={cn("flex min-w-0 items-center gap-1 text-xs text-muted-foreground", className)} aria-label="Breadcrumb">
      <Link to="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
        Home
      </Link>
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const current = index === segments.length - 1;
        let label = toLabel(segment);
        if (segment === employeeIdSegment) {
          label = employeeQuery.data?.name ?? segment;
        } else if (segment === roleIdSegment) {
          label = roleQuery.data?.name ?? segment;
        }
        return (
          <span key={href} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            {current ? (
              <span className="truncate font-medium text-foreground">{label}</span>
            ) : (
              <Link to={href} className="truncate hover:text-foreground">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}