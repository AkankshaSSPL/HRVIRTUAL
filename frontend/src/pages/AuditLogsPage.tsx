import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, UserCircle, ChevronLeft, ChevronRight } from "lucide-react";

import { AppLayout, EmptyState, PageContainer, PageHeader, SectionCard, Timeline, LoadingSkeleton } from "@/components/ui-system";
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

  const timelineItems = (data?.logs || []).map((log) => ({
    id: log.id,
    title: log.title,
    time: new Date(log.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
    description: log.message,
    meta: log.performed_by_name ? (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserCircle className="h-3.5 w-3.5" />
        <span>{log.performed_by_name}</span>
      </div>
    ) : null,
  }));

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
        ) : timelineItems.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon={ScrollText}
              title="No events yet"
              description="Audit logs will appear here as actions are performed."
            />
          </SectionCard>
        ) : (
          <SectionCard>
            <Timeline items={timelineItems} />
            
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t pt-4">
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
          </SectionCard>
        )}
      </PageContainer>
    </AppLayout>
  );
}
