import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DocumentPreviewModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8">
      <div className="relative flex h-full w-full max-w-5xl flex-col rounded-xl bg-background shadow-2xl border">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold tracking-tight">Document Viewer</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden bg-muted/30 p-2 sm:p-4">
          <iframe 
            src={url} 
            className="h-full w-full rounded-lg border bg-card shadow-sm" 
            title="Document Preview"
          />
        </div>
      </div>
    </div>
  );
}
