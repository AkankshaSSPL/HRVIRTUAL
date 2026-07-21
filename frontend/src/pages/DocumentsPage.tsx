import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout, EmptyState, LoadingSkeleton, PageContainer, PageHeader, SectionCard, StatusBadge } from "@/components/ui-system";
import { deleteDocument, getDocuments } from "@/services/documents";

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const documentsQuery = useQuery({ queryKey: ["documents"], queryFn: getDocuments });
  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const documents = documentsQuery.data ?? [];
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return documents;
    return documents.filter((d) =>
      [d.employee_name, d.document_type, d.status].some((v) => v?.toLowerCase().includes(value))
    );
  }, [documents, search]);

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Company Documents" />

        <SectionCard
          action={
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search documents" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          }
        >
          {documentsQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!documentsQuery.isLoading && !filtered.length ? (
            <EmptyState icon={FileText} title="No documents yet" />
          ) : null}
          {filtered.length ? (
            <div className="divide-y rounded-md border">
              {filtered.map((document) => (
                <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-md bg-blue-50 p-2 text-blue-700">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{document.document_type}</p>
                      <p className="truncate text-xs text-muted-foreground">{document.employee_name}</p>
                      {document.expiry_date ? (
                        <p className="truncate text-xs text-muted-foreground">Expires: {document.expiry_date}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={document.status}
                      tone={document.status === "VERIFIED" ? "success" : document.status === "REJECTED" ? "danger" : "warning"}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Open document"
                      onClick={() => window.open(document.document_url, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete document"
                      onClick={() => deleteMutation.mutate(document.id)}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>
      </PageContainer>
    </AppLayout>
  );
}