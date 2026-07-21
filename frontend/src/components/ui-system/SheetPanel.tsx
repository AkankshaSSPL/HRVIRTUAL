import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SheetPanelProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  side?: "left" | "right";
  size?: "md" | "lg" | "xl" | "2xl";
  onClose: () => void;
};

const sizeClasses: Record<NonNullable<SheetPanelProps["size"]>, string> = {
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-2xl",
  "2xl": "max-w-3xl",
};

export function SheetPanel({ open, title, children, side = "right", size = "md", onClose }: SheetPanelProps) {
  return (
    <>
      <div
        className={cn("fixed inset-0 z-40 bg-foreground/30 transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={onClose}
      />
      <section
        className={cn(
          "fixed inset-y-0 z-50 flex w-full flex-col border bg-card shadow-soft transition-transform",
          sizeClasses[size],
          side === "right" ? "right-0" : "left-0",
          open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </>
  );
}