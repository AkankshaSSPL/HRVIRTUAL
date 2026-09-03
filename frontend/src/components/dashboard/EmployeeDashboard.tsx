import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Trophy, AlertTriangle, MessageSquareWarning, LogIn, LogOut, CalendarDays, Calendar, Bell, ChevronRight, Users, ScanFace } from "lucide-react";
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

type Announcement = {
  id: string;
  title: string;
  category: string;
  priority: string;
  publish_date: string | null;
};

type Meeting = {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  organizer_id: string;
};

function getEmployeeDashboardStats() {
  return apiGet<EmployeeStats>("/dashboard/employee-stats");
}

function getRecentAnnouncements() {
  return apiGet<Announcement[]>("/dashboard/announcements");
}

function getUpcomingMeetings() {
  return apiGet<Meeting[]>("/dashboard/meetings");
}

function EmployeeWelcomeBanner({ userName, employmentType }: { userName: string; employmentType?: string }) {
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

  const announcementsQuery = useQuery({
    queryKey: ["recent-announcements"],
    queryFn: getRecentAnnouncements,
  });

  const meetingsQuery = useQuery({
    queryKey: ["upcoming-meetings"],
    queryFn: getUpcomingMeetings,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Your personal overview — attendance, announcements and meetings."
      />
      
      <EmployeeWelcomeBanner 
        userName={user?.full_name?.split(" ")[0] || "Employee"} 
        employmentType={statsQuery.data?.employment_type}
      />

      {statsQuery.isSuccess && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-sm overflow-hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 flex-shrink-0">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-muted-foreground truncate">Total Leaves</p>
              <p className="text-2xl font-bold text-foreground truncate">{statsQuery.data?.total_leaves ?? 0}</p>
              <p className="text-xs text-muted-foreground truncate">leaves taken</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-sm overflow-hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 flex-shrink-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-muted-foreground truncate">Total Warnings</p>
              <p className="text-2xl font-bold text-foreground truncate">{statsQuery.data?.warnings ?? 0}</p>
              <p className="text-xs text-muted-foreground truncate">issued to you</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-sm overflow-hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 flex-shrink-0">
              <Calendar className="h-6 w-6" />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-muted-foreground truncate">Total Attendance</p>
              <p className="text-2xl font-bold text-foreground truncate">{statsQuery.data?.total_attendance ?? 0} <span className="text-lg text-muted-foreground">/ {statsQuery.data?.working_days ?? 0}</span></p>
              <p className="text-xs text-muted-foreground truncate">days present this month</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-sm overflow-hidden">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full flex-shrink-0 ${user?.face_registered ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
              <ScanFace className="h-6 w-6" />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-muted-foreground truncate">Face Registration</p>
              <p className="text-lg font-bold text-foreground truncate">{user?.face_registered ? 'Registered' : 'Not Registered'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.face_samples_count ?? 0} samples captured</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Announcements */}
        <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-6 pb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Recent Announcements</h2>
              <p className="text-sm text-muted-foreground">Latest company announcements</p>
            </div>
            <Button variant="ghost" size="sm" className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50">
              View all <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-auto">
            {announcementsQuery.isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading announcements...</div>
            ) : announcementsQuery.data?.length ? (
              <div className="flex flex-col">
                {announcementsQuery.data.map((announcement, index) => (
                  <div key={announcement.id} className={`flex items-start gap-4 p-6 ${index !== 0 ? 'border-t border-border' : ''}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <h3 className="font-semibold text-foreground leading-tight">{announcement.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {announcement.category} • {announcement.publish_date}
                      </p>
                    </div>
                    {announcement.priority === "Urgent" && (
                      <div className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-500 shrink-0">
                        Urgent
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Bell className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">No announcements</p>
                <p className="mt-1 text-sm text-muted-foreground">There are no recent announcements to show.</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Meetings */}
        <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-6 pb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Upcoming Meetings</h2>
              <p className="text-sm text-muted-foreground">Scheduled meetings from today onwards</p>
            </div>
            <Button variant="ghost" size="sm" className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50">
              View all <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-auto">
            {meetingsQuery.isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading meetings...</div>
            ) : meetingsQuery.data?.length ? (
              <div className="flex flex-col p-6 gap-4">
                {meetingsQuery.data.map((meeting) => (
                  <div key={meeting.id} className="flex flex-col rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors">
                    <h3 className="font-semibold text-foreground">{meeting.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{meeting.description || "No description provided."}</p>
                    <div className="flex items-center gap-2 mt-4 text-sm font-medium text-slate-600">
                      <Clock className="h-4 w-4" />
                      {new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(meeting.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-300 mb-4">
                  <Users className="h-8 w-8" />
                </div>
                <p className="text-base font-medium text-slate-500">No upcoming meetings</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
