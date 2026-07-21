import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { AppLayout, EmptyState, PageContainer, SectionCard } from "@/components/ui-system";

export function UnauthorizedPage() {
  return (
    <AppLayout>
      <PageContainer>
        <SectionCard>
          <EmptyState
            icon={ShieldAlert}
            title="Unauthorized"
            description="Your current role does not include permission to access this workspace."
          />
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </SectionCard>
      </PageContainer>
    </AppLayout>
  );
}
