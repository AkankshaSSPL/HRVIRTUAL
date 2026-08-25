import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { apiGet } from "@/services/api";
import { useAuthStore } from "@/stores/authStore";

export function NotificationsDropdown() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { user } = useAuthStore();
  const isEmployeeOnly = user?.roles?.includes("Employee") && !user?.roles?.includes("Super Admin") && !user?.roles?.includes("HR");

  // Fetch data
  const { data } = useQuery({ 
    queryKey: ["notifications"], 
    queryFn: () => apiGet<{ notifications: Array<{ id: string, title: string, description: string, action_type: string }> }>("/notifications"), 
    refetchInterval: 30000 
  });

  let notifications = data?.notifications || [];
  
  if (isEmployeeOnly) {
    notifications = notifications.filter(n => n.action_type !== "employees" && !n.title.toLowerCase().includes("onboarding"));
  }

  const handleAction = (type: string) => {
    if (type === "leave") navigate("/leave");
    else if (type === "employees") navigate("/employees");
    else if (type === "calendar") navigate("/leave");
    setIsOpen(false);
  };

  const hasUnread = notifications.length > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <Button variant="ghost" size="icon" aria-label="Notifications" onClick={() => setIsOpen(!isOpen)} className="relative">
        <Bell className="h-5 w-5" />
        {hasUnread && (
          <span className="absolute right-2 top-2 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-md border bg-card text-card-foreground shadow-lg outline-none animate-in fade-in-80 slide-in-from-top-2">
          <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
            <h4 className="font-semibold text-sm">Notifications</h4>
            <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{notifications.length} new</span>
          </div>
          <div className="flex flex-col max-h-[400px] overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">You're all caught up!</p>
            ) : (
              notifications.map((notif) => (
                <button 
                  key={notif.id} 
                  onClick={() => handleAction(notif.action_type)}
                  className="flex flex-col items-start gap-1 rounded-md px-3 py-3 text-sm text-left transition-colors hover:bg-muted"
                >
                  <span className="font-semibold text-foreground">{notif.title}</span>
                  <span className="text-xs text-muted-foreground line-clamp-2">{notif.description}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
