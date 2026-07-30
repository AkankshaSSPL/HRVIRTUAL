import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

export type SidebarMenuItem = {
  name: string;
  href: string;
  icon?: LucideIcon;
  permission?: string;
  children?: SidebarMenuItem[];
};

type SidebarMenuProps = {
  items: SidebarMenuItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function SidebarMenu({ items, collapsed = false, onNavigate }: SidebarMenuProps) {
  const location = useLocation();
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const nextOpen: Record<string, boolean> = { ...openItems };
    let changed = false;
    items.forEach((item) => {
      if (item.children?.length) {
        const isChildActive = item.children.some(
          (child) => location.pathname + location.search === child.href || location.pathname === child.href,
        );
        const isParentActive = location.pathname === item.href;
        if ((isChildActive || isParentActive) && !nextOpen[item.name]) {
          nextOpen[item.name] = true;
          changed = true;
        }
      }
    });
    if (changed) {
      setOpenItems(nextOpen);
    }
  }, [location.pathname, location.search, items]);

  const toggleOpen = (name: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenItems((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const hasChildren = Boolean(item.children && item.children.length > 0);
        const isOpen = Boolean(openItems[item.name]);
        const Icon = item.icon;

        if (hasChildren) {
          const isParentActive =
            location.pathname === item.href ||
            item.children?.some(
              (child) => location.pathname + location.search === child.href || location.pathname === child.href,
            );

          return (
            <div key={item.name} className="space-y-0.5">
              <div
                className={cn(
                  "group flex h-9 items-center justify-between rounded-md px-3 text-sm font-medium transition-colors hover:bg-muted cursor-pointer",
                  isParentActive ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                  collapsed && "justify-center px-2",
                )}
                onClick={(e) => {
                  if (collapsed) {
                    onNavigate?.();
                  } else {
                    toggleOpen(item.name, e);
                  }
                }}
              >
                <NavLink
                  to={item.href}
                  onClick={() => onNavigate?.()}
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" /> : null}
                  {!collapsed ? <span className="truncate">{item.name}</span> : null}
                </NavLink>

                {!collapsed ? (
                  <button
                    type="button"
                    onClick={(e) => toggleOpen(item.name, e)}
                    className="ml-auto p-1 text-muted-foreground hover:text-foreground transition-transform"
                    aria-label={`Toggle ${item.name} menu`}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                ) : null}
              </div>

              {!collapsed && isOpen && item.children ? (
                <div className="ml-5 border-l border-border/60 pl-3 space-y-0.5 py-0.5">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.name}
                      to={child.href}
                      onClick={onNavigate}
                      className={({ isActive }) => {
                        const isExact = child.href.includes("?")
                          ? location.pathname + location.search === child.href
                          : isActive && !location.search;
                        return cn(
                          "flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-colors",
                          isExact
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                        );
                      }}
                    >
                      {child.icon ? <child.icon className="h-3.5 w-3.5 shrink-0" /> : null}
                      <span className="truncate">{child.name}</span>
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <div key={item.name}>
            <NavLink
              to={item.href}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-primary/10 text-primary font-semibold",
                  collapsed && "justify-center px-2",
                )
              }
              title={collapsed ? item.name : undefined}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.name}</span> : null}
            </NavLink>
          </div>
        );
      })}
    </nav>
  );
}
