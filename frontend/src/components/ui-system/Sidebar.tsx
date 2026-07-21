import {
  Activity,
  BadgeCheck,
  // ONBOARDING DISABLED: BadgeCheck, // was only used by the Onboarding nav item below
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Gauge,
  Landmark,
  LibraryBig,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarMenu, type SidebarMenuItem } from "@/components/ui-system/SidebarMenu";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";

export const sidebarItems: SidebarMenuItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Gauge, permission: "dashboard:view" },
  { name: "Employees", href: "/employees", icon: Users, permission: "employees:view" },
  { name: "Candidates", href: "/candidates", icon: UserPlus, permission: "candidates:view" },
  { name: "Onboarding", href: "/onboarding", icon: BadgeCheck, permission: "onboarding:view" },
  { name: "Attendance", href: "/attendance", icon: CalendarClock, permission: "attendance:view" },
  { name: "Leave", href: "/leave", icon: ClipboardCheck, permission: "leave:view" },
  { name: "Payroll", href: "/payroll", icon: Landmark, permission: "payroll:view" },
  { name: "Documents", href: "/documents", icon: FileText, permission: "documents:view" },
  { name: "Assets", href: "/assets", icon: BriefcaseBusiness, permission: "assets:view" },
  { name: "Offboarding", href: "/offboarding", icon: LogOut, permission: "offboarding:view" },
  { name: "Approvals", href: "/approvals", icon: ShieldCheck, permission: "approvals:view" },
  { name: "Agent Command", href: "/agent-command", icon: Sparkles, permission: "agent_command:view" },
  { name: "Audit Logs", href: "/audit-logs", icon: ScrollText, permission: "audit_logs:view" },
  { name: "Masters", href: "/masters", icon: LibraryBig, permission: "settings:view" },
  { name: "Settings", href: "/settings", icon: Settings, permission: "settings:view" },
];

export function Sidebar() {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const visibleItems = sidebarItems.filter((item) => !item.permission || hasPermission(item.permission));

  const content = (mobile = false) => (
    <>
      <div className={cn("flex h-16 items-center gap-3 border-b px-4", sidebarCollapsed && !mobile && "justify-center")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </div>
        {(!sidebarCollapsed || mobile) && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Agentic HRMS</p>
            <p className="truncate text-xs text-muted-foreground">Enterprise Operations</p>
          </div>
        )}
        {mobile ? (
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarMenu items={visibleItems} collapsed={sidebarCollapsed && !mobile} onNavigate={() => setSidebarOpen(false)} />
      </div>
      <div className="border-t p-3">
        <div className={cn("flex items-center gap-3 rounded-md border bg-background p-3", sidebarCollapsed && !mobile && "justify-center")}>
          <Activity className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
          {(!sidebarCollapsed || mobile) && (
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">Agent Fabric</p>
              <p className="truncate text-xs text-muted-foreground">Ready</p>
            </div>
          )}
        </div>
        {!mobile ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-center"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!sidebarCollapsed ? "Collapse" : null}
          </Button>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-foreground/35 backdrop-blur-sm transition-opacity lg:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-card transition-transform lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {content(true)}
      </aside>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-card transition-[width] lg:flex",
          sidebarCollapsed ? "w-20" : "w-72",
        )}
      >
        {content(false)}
      </aside>
    </>
  );
}