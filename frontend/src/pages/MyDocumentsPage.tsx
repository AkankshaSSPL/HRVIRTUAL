import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Calendar } from "lucide-react";
import { AppLayout, PageContainer, PageHeader, LoadingSkeleton, EmptyState } from "@/components/ui-system";
import { getMyDocuments } from "@/services/documents";
import { getBackendUrl } from "@/services/knowledge";

export function MyDocumentsPage() {
  const documentsQuery = useQuery({
    queryKey: ["my-documents"],
    queryFn: getMyDocuments,
  });

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="My Documents"
          description="View and download your uploaded employment documents."
        />

        <div className="mt-6">
          {documentsQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 rounded-xl bg-card border shadow-sm animate-pulse"></div>
              ))}
            </div>
          ) : documentsQuery.isSuccess && documentsQuery.data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documentsQuery.data.map((doc) => (
                <div key={doc.id} className="bg-card rounded-xl border shadow-sm p-5 flex flex-col h-full hover:shadow-md transition-shadow relative">
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <h3 className="font-semibold text-foreground leading-tight line-clamp-2">{doc.document_type}</h3>
                  </div>
                  
                  {doc.notes && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{doc.notes}</p>
                  )}

                  <div className="flex items-center text-xs text-muted-foreground mb-4">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    Uploaded:
                    <span className="ml-1 text-foreground font-medium">{new Date(doc.upload_date).toLocaleDateString()}</span>
                  </div>

                  <div className="mt-auto pt-4 border-t flex justify-end">
                    {doc.file_url ? (
                      <button 
                        className="text-primary hover:text-primary/80 flex items-center text-sm font-medium transition-colors"
                        onClick={() => window.open(getBackendUrl(doc.file_url), '_blank')}
                      >
                        <Download className="w-4 h-4 mr-1.5" />
                        Download
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file available</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState 
              icon={FileText} 
              title="No Documents Found" 
              description="You have not uploaded any documents yet, or they are pending approval." 
            />
          )}
        </div>
      </PageContainer>
    </AppLayout>
  );
}
