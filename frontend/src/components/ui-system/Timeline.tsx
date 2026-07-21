import type { ReactNode } from "react";

type TimelineItem = {
  id: string;
  title: string;
  time?: string;
  description?: string;
  meta?: ReactNode;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={item.id} className="relative pl-7">
          {index !== items.length - 1 ? <span className="absolute left-2 top-5 h-full w-px bg-border" /> : null}
          <span className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-card" />
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{item.title}</p>
              {item.time ? <span className="text-xs text-muted-foreground">{item.time}</span> : null}
            </div>
            {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
            {item.meta}
          </div>
        </li>
      ))}
    </ol>
  );
}

