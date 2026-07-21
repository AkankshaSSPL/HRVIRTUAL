import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

export type SidebarMenuItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  children?: SidebarMenuItem[];
};

type SidebarMenuProps = {
  items: SidebarMenuItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function SidebarMenu({ items, collapsed = false, onNavigate }: SidebarMenuProps) {
  return (
    <nav className="space-y-1">
      {items.map((item) => (
        <div key={item.name}>
          <NavLink
            to={item.href}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-primary/10 text-primary",
                collapsed && "justify-center px-2",
              )
            }
            title={collapsed ? item.name : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.name}</span> : null}
            {!collapsed && item.children?.length ? <ChevronDown className="h-3.5 w-3.5" /> : null}
          </NavLink>
        </div>
      ))}
    </nav>
  );
}
