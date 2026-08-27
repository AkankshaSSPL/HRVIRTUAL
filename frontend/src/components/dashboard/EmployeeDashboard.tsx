import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Trophy, AlertTriangle, MessageSquareWarning, LogIn, LogOut, CalendarDays, Calendar } from "lucide-react";
import { PageContainer, PageHeader, SectionCard } from "@/components/ui-system";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/services/api";

type EmployeeStats = {
  total_leaves: number;
  warnings: number;
  total_attendance: number;
  working_days: number;
  employment_type: string;
};

function getEmployeeDashboardStats() {
  return apiGet<EmployeeStats>("/dashboard/employee-stats");
}

function EmployeeWelcomeBanner({ userName, clockedIn, employmentType }: { userName: string; clockedIn: boolean; employmentType?: string }) {
  // Format employment type: FULL_TIME -> Full Time, CONSULTANT -> Consultant
  const formattedType = employmentType 
    ? employmentType.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
    : '';

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl bg-slate-800 px-6 py-8 text-white shadow-md">
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col items-start gap-1">
          <p className="text-sm font-medium text-slate-300">Good afternoon,</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {userName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Here's your personal overview for today.</p>
          <div className={`mt-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${clockedIn ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            <span className={`flex h-2 w-2 rounded-full ${clockedIn ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-400'}`}></span>
            {clockedIn ? 'Clocked in' : 'Clocked out'}
          </div>
        </div>
      </div>

      {/* Decorative Glows */}
      <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl"></div>
      <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl"></div>
    </div>
  );
}

import { useAuthStore } from "@/stores/authStore";

export function EmployeeDashboard() {
  const { user } = useAuthStore();
  
  const statsQuery = useQuery({
    queryKey: ["employee-stats"],
    queryFn: getEmployeeDashboardStats,
  });

  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);

  const handleClockIn = () => {
    if (clockedIn) return;
    const now = new Date();
    setClockInTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setClockedIn(true);
    setClockOutTime(null);
  };

  const handleClockOut = () => {
    if (!clockedIn) return;
    const now = new Date();
    setClockOutTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setClockedIn(false);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Your personal overview — attendance, announcements and meetings."
      />
      
      <EmployeeWelcomeBanner 
        userName={user?.full_name?.split(" ")[0] || "Employee"} 
        clockedIn={clockedIn} 
        employmentType={statsQuery.data?.employment_type}
      />

      {statsQuery.isSuccess && (
        <div className="grid gap-6 sm:grid-cols-3 mb-6">
          <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-800">Total Leaves</p>
              <p className="text-2xl font-bold text-emerald-900">{statsQuery.data?.total_leaves ?? 0}</p>
              <p className="text-xs text-emerald-700">leaves taken</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800">Total Warnings</p>
              <p className="text-2xl font-bold text-amber-900">{statsQuery.data?.warnings ?? 0}</p>
              <p className="text-xs text-amber-700">issued to you</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-rose-800">Total Attendance</p>
              <p className="text-2xl font-bold text-rose-900">{statsQuery.data?.total_attendance ?? 0} <span className="text-lg text-rose-700/70">/ {statsQuery.data?.working_days ?? 0}</span></p>
              <p className="text-xs text-rose-700">days present this month</p>
            </div>
          </div>
        </div>
      )}

      <SectionCard 
        title="Attendance" 
        description="Today's clock in / clock out"
        actions={
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
          </div>
        }
      >
        <div className="grid gap-6 sm:grid-cols-3 items-center">
          <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/30 p-6 text-center h-full">
            <p className="text-sm font-medium text-emerald-800">Clock In</p>
            <p className="text-3xl font-bold text-emerald-900 my-1">{clockInTime || "--:--"}</p>
            <p className="text-xs font-medium text-emerald-700">Today</p>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 h-full">
            <Button 
              className={`w-full max-w-[200px] gap-2 ${clockedIn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}
              disabled={clockedIn}
              onClick={handleClockIn}
            >
              <LogIn className="h-4 w-4" />
              {clockedIn ? "Clocked In" : "Clock In"}
            </Button>
            <Button 
              variant="outline" 
              className="w-full max-w-[200px] gap-2 bg-muted/50"
              disabled={!clockedIn}
              onClick={handleClockOut}
            >
              <LogOut className="h-4 w-4" />
              Clock Out
            </Button>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/30 p-6 text-center h-full">
            <p className="text-sm font-medium text-rose-800">Clock Out</p>
            <p className="text-3xl font-bold text-rose-900 my-1">{clockOutTime || "--:--"}</p>
            <p className="text-xs font-medium text-rose-700">Today</p>
          </div>
        </div>
      </SectionCard>

    </PageContainer>
  );
}
