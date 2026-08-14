import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPayrollPreview } from "@/services/payroll";
import { cn } from "@/lib/utils";

type PayrollPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  runId: string | null;
  type: "employee" | "consultant" | "tds" | "bank" | null;
  isApproved: boolean;
  onDownload: () => void;
  isDownloading?: boolean;
};

export function PayrollPreviewModal({
  open,
  onClose,
  runId,
  type,
  isApproved,
  onDownload,
  isDownloading,
}: PayrollPreviewModalProps) {
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (open) setActiveTab(0);
  }, [open]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll-preview", runId, type],
    queryFn: () => getPayrollPreview(runId!, type!),
    enabled: open && !!runId && !!type,
    staleTime: 0,
    gcTime: 0,
  });

  if (!open) return null;

  const tabs = data?.tabs || [];
  const currentTab = tabs[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-[95vw] flex-col rounded-lg border bg-card shadow-soft">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold">Preview Sheet Data</h2>
            {!isApproved && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Awaiting approval. Download is currently disabled.
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-muted/10">
          {isLoading ? (
            <div className="flex h-full flex-col gap-3 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse">Generating preview...</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-destructive font-medium">
              Failed to load preview data. Please try again.
            </div>
          ) : tabs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No data available.
            </div>
          ) : (
            <>
              {tabs.length > 1 && (
                <div className="flex border-b bg-card px-2">
                  {tabs.map((tab, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveTab(idx)}
                      className={cn(
                        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                        activeTab === idx 
                          ? "border-primary text-primary" 
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                      )}
                    >
                      {tab.name}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="flex-1 overflow-auto p-4">
                <div className="rounded-md border bg-card shadow-sm overflow-x-auto">
                  <table className="w-full text-xs text-left whitespace-nowrap">
                    <tbody>
                      {currentTab.rows.map((row, rIndex) => (
                        <tr key={rIndex} className={cn("border-b last:border-0", typeof row[0] === "string" && row[0].includes("Total") ? "font-bold bg-muted/40" : "hover:bg-muted/20")}>
                          {row.map((cell, cIndex) => {
                            // Basic heuristic for header rows vs data rows to make it look nicer
                            const isHeader = rIndex < 5 && typeof cell === 'string' && cell === cell.toUpperCase() && cell.length > 2;
                            return (
                              <td key={cIndex} className={cn("px-3 py-2.5", isHeader && "font-semibold bg-muted/30 border-y")}>
                                {cell === null || cell === undefined ? "" : String(cell)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t bg-card px-4 py-3">
          <Button variant="outline" onClick={onClose}>
            Exit
          </Button>
          <Button 
            variant="outline"
            disabled={!isApproved || isLoading || isDownloading} 
            onClick={onDownload}
            className={cn(
              !isApproved 
                ? "bg-muted text-muted-foreground border-transparent opacity-100 hover:bg-muted hover:text-muted-foreground" 
                : "bg-background hover:bg-accent"
            )}
          >
            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
