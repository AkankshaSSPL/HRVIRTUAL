import type { ReactNode } from "react";

import { Header } from "@/components/ui-system/Header";
import { Sidebar } from "@/components/ui-system/Sidebar";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";

type AppLayoutProps = {
  children: ReactNode;
  minimal?: boolean;
};

export function AppLayout({ children, minimal = false }: AppLayoutProps) {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);

  if (minimal) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className={cn("min-h-screen transition-[padding] lg:pl-72", sidebarCollapsed && "lg:pl-20")}>
        <Header />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

