import { cn } from "@/lib/utils";
import { useAgentTheme } from "@/lib/agent-theme";
import { Download, FileSpreadsheet } from "lucide-react";

interface PayrollExportDownloadProps {
  title: string;
  filename: string;
  downloadUrl: string;
}

export function PayrollExportDownload({ title, filename, downloadUrl }: PayrollExportDownloadProps) {
  const theme = useAgentTheme("payroll");
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-lg border p-3 shadow-sm", theme.soft)}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", theme.icon)}>
          <FileSpreadsheet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{filename}</p>
        </div>
      </div>
      <a href={`${apiBase}${downloadUrl}`} download={filename} className="shrink-0">
        <button className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted">
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </a>
    </div>
  );
}