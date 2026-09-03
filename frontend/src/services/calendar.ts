import { apiGet } from "./api";

export type CalendarEvent = {
  id: string;
  type: "meeting" | "holiday" | "leave" | "birthday";
  title: string;
  date: string;
  end_date: string | null;
};

export function getCalendarEvents(month: number, year: number) {
  return apiGet<CalendarEvent[]>(`/dashboard/calendar?month=${month}&year=${year}`);
}
