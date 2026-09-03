import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 transition-all duration-300">
      <div className="w-full max-w-md rounded-2xl border border-white/20 dark:border-slate-800 bg-white dark:bg-card p-6 shadow-2xl animate-swal-pop">
        <div className="flex gap-4">
          <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <AlertCircle className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 pt-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" className="rounded-xl px-5 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="rounded-xl px-6 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

