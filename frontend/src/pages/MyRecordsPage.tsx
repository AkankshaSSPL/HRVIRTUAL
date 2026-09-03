import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, FileText } from "lucide-react";
import { AppLayout, PageContainer, PageHeader } from "@/components/ui-system";
import { apiGet } from "@/services/api";

type EmployeeRecord = {
  id: string;
  record_type: "WARNING" | "NOTE";
  title: string;
  description: string | null;
  date_issued: string;
};

export function MyRecordsPage() {
  const recordsQuery = useQuery({
    queryKey: ["my-records"],
    queryFn: () => apiGet<EmployeeRecord[]>("/dashboard/my-records"),
  });

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="My Records"
          description="View official disciplinary records and notes filed by HR."
        />

        <div className="mt-6">
          {recordsQuery.isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse"></div>
              ))}
            </div>
          ) : recordsQuery.isSuccess && recordsQuery.data.length > 0 ? (
            <div className="space-y-4">
              {recordsQuery.data.map((record) => (
                <div 
                  key={record.id} 
                  className={`rounded-xl border p-5 shadow-sm flex flex-col gap-2 ${
                    record.record_type === "WARNING" 
                      ? "border-amber-200 bg-amber-50" 
                      : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {record.record_type === "WARNING" ? (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Info className="h-5 w-5 text-blue-500" />
                    )}
                    <h3 className="font-semibold text-slate-900">{record.title}</h3>
                    <span className="ml-auto text-xs font-medium text-slate-500 bg-white/60 px-2 py-1 rounded">
                      {record.date_issued}
                    </span>
                  </div>
                  {record.description && (
                    <div className="pl-7 mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                      {record.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-4">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-lg font-medium text-slate-900">No Records Found</p>
              <p className="text-sm text-muted-foreground mt-1">There are no official notes or warnings on your profile.</p>
            </div>
          )}
        </div>
      </PageContainer>
    </AppLayout>
  );
}
