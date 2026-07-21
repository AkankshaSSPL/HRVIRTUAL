import { Boxes } from "lucide-react";

import { AppLayout, EmptyState, PageContainer, PageHeader, SectionCard } from "@/components/ui-system";

type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title={title} description="Module shell reserved for future HRMS domain workflows and dedicated agents." />
        <SectionCard>
          <EmptyState
            icon={Boxes}
            title={`${title} module foundation`}
            description="The reusable enterprise shell is ready. Business logic, agent workflow, tables, and forms can be added without changing layout architecture."
          />
        </SectionCard>
      </PageContainer>
    </AppLayout>
  );
}

