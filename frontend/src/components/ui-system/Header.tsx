import { Bell, Menu, Search, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui-system/Breadcrumbs";
import { SearchBar } from "@/components/ui-system/SearchBar";
import { useAppStore } from "@/stores/appStore";
import { useAuthStore } from "@/stores/authStore";

export function Header() {
  const navigate = useNavigate();
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <SearchBar className="hidden max-w-sm xl:block" placeholder="Search people, agents, approvals" />
      <Button variant="ghost" size="icon" aria-label="Global search" className="xl:hidden">
        <Search className="h-5 w-5" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell className="h-5 w-5" />
      </Button>
      <Button variant="outline" className="hidden gap-2 sm:inline-flex" onClick={handleLogout}>
        <UserCircle className="h-4 w-4" />
        {user?.full_name ?? "Profile"}
      </Button>
    </header>
  );
}
