import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getEmployees } from "@/services/employees";
import { getPendingLeaveRequests, getLeaveCalendar } from "@/services/leave";
import { Button } from "@/components/ui/button";

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

  // Fetch data
  const { data: employees } = useQuery({ queryKey: ["employees"], queryFn: getEmployees, refetchInterval: 30000 });
  const { data: pendingLeaves } = useQuery({ queryKey: ["pending-leaves"], queryFn: getPendingLeaveRequests, refetchInterval: 30000 });
  const { data: calendar } = useQuery({ queryKey: ["leave-calendar"], queryFn: getLeaveCalendar, refetchInterval: 30000 });

  // Process notifications
  const notifications = [];

  // 1. Pending Approvals
  if (pendingLeaves?.length) {
    notifications.push({
      id: "pending-leaves",
      title: `${pendingLeaves.length} Pending Leave Approval${pendingLeaves.length > 1 ? "s" : ""}`,
      description: "You have leave requests waiting for review.",
      action: () => navigate("/leave"),
    });
  }

  // 2. Pending Onboarding
  const pendingOnboarding = employees?.items.filter((e) => e.onboarding_percent !== null && e.onboarding_percent !== undefined && e.onboarding_percent < 100) || [];
  if (pendingOnboarding.length) {
    notifications.push({
      id: "pending-onboarding",
      title: `${pendingOnboarding.length} Pending Onboarding${pendingOnboarding.length > 1 ? "s" : ""}`,
      description: pendingOnboarding.map(e => e.name ?? e.first_name).slice(0, 3).join(", ") + (pendingOnboarding.length > 3 ? "..." : ""),
      action: () => navigate("/employees"),
    });
  }

  // 3. Absent / On Leave Today
  const today = new Date().toISOString().split("T")[0];
  const absentToday = calendar?.filter((c) => {
    if (c.status !== "APPROVED") return false;
    const from = c.from_date ?? c.start_date;
    const to = c.to_date ?? c.end_date ?? from;
    if (!from || !to) return false;
    return from <= today && to >= today;
  }) || [];
  
  if (absentToday.length) {
    notifications.push({
      id: "absent-today",
      title: `${absentToday.length} Employee${absentToday.length > 1 ? "s" : ""} on Leave Today`,
      description: absentToday.map((c) => c.employee_name).join(", "),
      action: () => navigate("/leave"),
    });
  }

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
                  onClick={() => {
                    setIsOpen(false);
                    if (notif.action) notif.action();
                  }}
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
