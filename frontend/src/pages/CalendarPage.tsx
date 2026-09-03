import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay, parseISO } from "date-fns";
import { AppLayout, PageContainer, PageHeader } from "@/components/ui-system";
import { Button } from "@/components/ui/button";
import { getCalendarEvents } from "@/services/calendar";

export function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<"month" | "week" | "day">("month");

    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    const eventsQuery = useQuery({
        queryKey: ["calendar-events", month, year],
        queryFn: () => getCalendarEvents(month, year),
    });

    const events = eventsQuery.data || [];

    const nextTime = () => {
        if (view === "month") setCurrentDate(addMonths(currentDate, 1));
        else if (view === "week") setCurrentDate(addDays(currentDate, 7));
        else setCurrentDate(addDays(currentDate, 1));
    };
    const prevTime = () => {
        if (view === "month") setCurrentDate(subMonths(currentDate, 1));
        else if (view === "week") setCurrentDate(subDays(currentDate, 7));
        else setCurrentDate(subDays(currentDate, 1));
    };
    const goToToday = () => setCurrentDate(new Date());

    const monthStart = startOfMonth(currentDate);

    let days: Date[] = [];
    if (view === "month") {
        days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });
    } else if (view === "week") {
        days = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
    } else {
        days = [currentDate];
    }

    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const headers = view === "day" ? [format(currentDate, "EEEE, MMMM d, yyyy")] : weekDays;
    const gridCols = view === "day" ? "grid-cols-1" : "grid-cols-7";

    // Compute stats for "This Month" summary
    const stats = {
        meetings: events.filter(e => e.type === "meeting").length,
        holidays: events.filter(e => e.type === "holiday").length,
        leaves: events.filter(e => e.type === "leave").length,
        birthdays: events.filter(e => e.type === "birthday").length,
    };
    const totalEvents = stats.meetings + stats.holidays + stats.leaves + stats.birthdays;

    return (
        <AppLayout>
            <PageContainer>
                <PageHeader 
                    title="Calendar" 
                    description="View your scheduled events and activities."
                />
                
                <div className="flex flex-col lg:flex-row gap-6 mt-6">
                    <div className="flex-1 rounded-xl border bg-card p-6 shadow-sm overflow-hidden min-w-0">
                        {/* Legend */}
                        <div className="flex items-center gap-6 pb-6 border-b text-sm mb-6">
                            <span className="font-medium text-slate-500">Legend:</span>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-600"></div>Meetings</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-600"></div>Holidays</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-600"></div>Leaves</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-pink-600"></div>Birthdays</div>
                        </div>

                        {/* Toolbar */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className="flex rounded-md shadow-sm border border-slate-700 bg-slate-700 text-white overflow-hidden">
                                    <button onClick={prevTime} className="px-3 py-2 hover:bg-slate-600 transition-colors">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <div className="w-[1px] bg-slate-600"></div>
                                    <button onClick={nextTime} className="px-3 py-2 hover:bg-slate-600 transition-colors">
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                                <Button variant="secondary" className="bg-slate-500 text-white hover:bg-slate-600" onClick={goToToday}>
                                    today
                                </Button>
                            </div>
                            
                            <h2 className="text-3xl font-normal text-slate-900">
                                {view === "day" ? format(currentDate, "MMMM d, yyyy") : format(currentDate, "MMMM yyyy")}
                            </h2>

                            <div className="flex rounded-md shadow-sm border border-slate-800 bg-slate-800 text-white overflow-hidden text-sm">
                                <button onClick={() => setView("month")} className={`px-4 py-2 ${view === "month" ? "bg-slate-900 font-medium" : "hover:bg-slate-700 text-slate-300 transition-colors"}`}>month</button>
                                <div className="w-[1px] bg-slate-700"></div>
                                <button onClick={() => setView("week")} className={`px-4 py-2 ${view === "week" ? "bg-slate-900 font-medium" : "hover:bg-slate-700 text-slate-300 transition-colors"}`}>week</button>
                                <div className="w-[1px] bg-slate-700"></div>
                                <button onClick={() => setView("day")} className={`px-4 py-2 ${view === "day" ? "bg-slate-900 font-medium" : "hover:bg-slate-700 text-slate-300 transition-colors"}`}>day</button>
                            </div>
                        </div>

                        {/* Calendar Grid */}
                        <div className="border border-slate-200 rounded-sm">
                            {/* Weekday headers */}
                            <div className={`grid ${gridCols} border-b border-slate-200 bg-slate-50`}>
                                {headers.map(day => (
                                    <div key={day} className="py-2 text-center font-bold text-slate-800 border-r border-slate-200 last:border-r-0">
                                        {day}
                                    </div>
                                ))}
                            </div>
                            
                            {/* Days */}
                            <div className={`grid ${gridCols} auto-rows-[minmax(80px,_auto)]`}>
                                {days.map((day, idx) => {
                                    const isCurrentMonth = isSameMonth(day, monthStart);
                                    // Get events for this day
                                    const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
                                    
                                    // Color logic based on type
                                    const getColorClasses = (type: string) => {
                                        switch(type) {
                                            case 'meeting': return 'bg-blue-50 border-blue-200 text-blue-600';
                                            case 'holiday': return 'bg-emerald-50 border-emerald-200 text-emerald-600';
                                            case 'leave': return 'bg-amber-50 border-amber-200 text-amber-600';
                                            case 'birthday': return 'bg-pink-50 border-pink-200 text-pink-600';
                                            default: return 'bg-slate-100 border-slate-200 text-slate-700';
                                        }
                                    };

                                    return (
                                        <div 
                                            key={day.toString()} 
                                            className={`min-h-[80px] p-1 border-r border-b border-slate-200 flex flex-col
                                                ${view === "month" && !isCurrentMonth ? 'bg-slate-50/50' : (isToday(day) ? 'bg-yellow-50/30' : '')}
                                                ${idx % (view === "day" ? 1 : 7) === (view === "day" ? 0 : 6) ? 'border-r-0' : ''}
                                            `}
                                        >
                                            <div className={`text-right p-1 text-sm ${view === "month" && !isCurrentMonth ? 'text-slate-300' : 'text-slate-700'} ${isToday(day) ? 'font-bold' : ''}`}>
                                                {format(day, "d")}
                                            </div>
                                            <div className="flex-1 flex flex-col gap-1 overflow-y-auto px-1">
                                                {dayEvents.map(evt => (
                                                    <div 
                                                        key={evt.id} 
                                                        title={evt.title}
                                                        className={`text-xs px-2 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 transition-opacity ${getColorClasses(evt.type)}`}
                                                    >
                                                        {evt.title}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right Sidebar Summary */}
                    <div className="w-full lg:w-72 flex flex-col gap-6">
                        <div className="rounded-xl border bg-card p-6 shadow-sm">
                            <h3 className="font-bold text-slate-900 mb-6 pb-4 border-b">This Month</h3>
                            
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Meetings</span>
                                    <span className="font-bold text-blue-600">{stats.meetings}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Holidays</span>
                                    <span className="font-bold text-emerald-600">{stats.holidays}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Leaves</span>
                                    <span className="font-bold text-amber-600">{stats.leaves}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Birthdays</span>
                                    <span className="font-bold text-pink-600">{stats.birthdays}</span>
                                </div>
                                
                                <div className="pt-4 mt-4 border-t flex justify-between items-center">
                                    <span className="text-slate-700 font-medium">Total Events</span>
                                    <span className="font-bold text-slate-900">{totalEvents}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </PageContainer>
        </AppLayout>
    );
}
