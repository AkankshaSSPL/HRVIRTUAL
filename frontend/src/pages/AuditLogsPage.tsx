import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, UserCircle, ChevronLeft, ChevronRight } from "lucide-react";

import { AppLayout, EmptyState, PageContainer, PageHeader, SectionCard, LoadingSkeleton } from "@/components/ui-system";
import { Button } from "@/components/ui/button";
import { getAuditLogs } from "@/services/audit";

const PAGE_SIZE = 20;

export function AuditLogsPage() {
  const [page, setPage] = useState(0);
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: () => getAuditLogs(page * PAGE_SIZE, PAGE_SIZE),
    refetchInterval: 15000,
  });

  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="Audit Logs"
          description="A complete history of actions and changes within the system."
        />

        {isLoading ? (
          <SectionCard>
            <LoadingSkeleton rows={5} />
          </SectionCard>
        ) : isError ? (
          <SectionCard>
            <EmptyState
              icon={ScrollText}
              title="Unable to load logs"
              description="There was a problem retrieving the audit history."
            />
          </SectionCard>
        ) : (data?.logs || []).length === 0 ? (
          <SectionCard>
            <EmptyState
              icon={ScrollText}
              title="No events yet"
              description="Audit logs will appear here as actions are performed."
            />
          </SectionCard>
        ) : (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Event</th>
                    <th className="px-6 py-4 font-semibold">Description</th>
                    <th className="px-6 py-4 font-semibold">Performed By</th>
                    <th className="px-6 py-4 font-semibold text-right">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.logs || []).map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-muted/30 group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-2 rounded-full bg-primary/40 transition-colors group-hover:bg-primary"></div>
                          <span className="font-semibold text-foreground whitespace-nowrap">{log.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{log.message}</td>
                      <td className="px-6 py-4">
                        {log.performed_by_name ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                              <UserCircle className="h-4 w-4" />
                            </div>
                            <span className="font-medium whitespace-nowrap">{log.performed_by_name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic whitespace-nowrap">System generated</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t bg-muted/20 px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing <span className="font-medium">{page * PAGE_SIZE + 1}</span> to{" "}
                  <span className="font-medium">{Math.min((page + 1) * PAGE_SIZE, total)}</span> of{" "}
                  <span className="font-medium">{total}</span> results
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
