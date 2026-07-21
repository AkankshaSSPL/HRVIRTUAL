import type { LucideIcon } from "lucide-react";

type Activity = {
  id: string;
  title: string;
  description: string;
  time: string;
  icon: LucideIcon;
};

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-3 rounded-md border p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <activity.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{activity.title}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{activity.time}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

