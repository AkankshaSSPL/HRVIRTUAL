import type { ReactNode } from "react";

import { SheetPanel } from "@/components/ui-system/SheetPanel";

type DrawerPanelProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  size?: "md" | "lg" | "xl" | "2xl";
  onClose: () => void;
};

export function DrawerPanel(props: DrawerPanelProps) {
  return <SheetPanel side="right" {...props} />;
}