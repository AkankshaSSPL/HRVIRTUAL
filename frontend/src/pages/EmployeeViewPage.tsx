import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Calendar, FileText, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppLayout, EmptyState, LoadingSkeleton, PageContainer, PageHeader, StatusBadge } from "@/components/ui-system";
import { getEmployee, getEmployeeDocuments, type EmployeeDocumentRecord } from "@/services/employees";

type TabKey = "basic" | "employment" | "contact" | "banking" | "certifications" | "documents";

const TABS: { key: TabKey; label: string }[] = [
  { key: "basic", label: "Basic Info" },
  { key: "employment", label: "Employment" },
  { key: "contact", label: "Contact" },
  { key: "banking", label: "Banking" },
  { key: "certifications", label: "Certifications" },
  { key: "documents", label: "Documents" },
];

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || value === 0 ? value : "Not provided"}</p>
    </div>
  );
}

function SidebarRow({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

export function EmployeeViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("basic");

  const employeeQuery = useQuery({
    queryKey: ["employee", id],
    queryFn: () => getEmployee(id!),
    enabled: Boolean(id),
  });

  const documentsQuery = useQuery({
    queryKey: ["employee-documents", id],
    queryFn: () => getEmployeeDocuments(id!),
    enabled: Boolean(id) && activeTab === "documents",
  });

  const employee = employeeQuery.data;

  const displayName = useMemo(() => {
    if (employee?.name) return employee.name;
    const combined = [employee?.first_name, employee?.last_name].filter(Boolean).join(" ");
    return combined || "Unnamed employee";
  }, [employee]);

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title={displayName}
          description={employeeQuery.isLoading ? "Loading employee record..." : undefined}
          actions={
            <Button variant="outline" onClick={() => navigate("/employees")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          }
        />

        {employeeQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}
        {employeeQuery.isError ? (
          <EmptyState title="Unable to load employee" description="This employee record could not be retrieved." />
        ) : null}

        {employee ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
            {/* Sidebar */}
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary/15 text-2xl font-semibold text-secondary">
                  {initials(displayName)}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">{displayName}</h2>
                <p className="text-sm text-muted-foreground">{employee.designation ?? "Employee"}</p>
                <div className="mt-2">
                  <StatusBadge
                    status={(employee.status ?? "ACTIVE").replace("_", " ")}
                    tone={employee.status === "ACTIVE" ? "success" : employee.status === "PROBATION" ? "info" : "warning"}
                  />
                </div>
              </div>

              <div className="mt-6 space-y-3 border-t pt-4">
                <SidebarRow icon={FileText}>
                  Employee ID: {employee.employee_code ?? "—"}
                </SidebarRow>
                <SidebarRow icon={Mail}>{employee.official_email ?? employee.personal_email ?? "No email on file"}</SidebarRow>
                <SidebarRow icon={Phone}>{employee.phone ?? "No phone on file"}</SidebarRow>
                <SidebarRow icon={Calendar}>DOB: {employee.dob ?? "Not set"}</SidebarRow>
                <SidebarRow icon={Calendar}>Joined: {employee.joining_date ?? "Not set"}</SidebarRow>
                <SidebarRow icon={Building2}>{employee.department ?? "Unassigned"}</SidebarRow>
              </div>
            </div>

            {/* Main panel */}
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={
                      activeTab === tab.key
                        ? "rounded-md bg-background px-4 py-1.5 text-sm font-medium text-foreground shadow-sm"
                        : "rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                {activeTab === "basic" ? (
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Basic Information</h3>
                    <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                      <DetailField label="Full Name" value={displayName} />
                      <DetailField label="Employee ID" value={employee.employee_code} />
                      <DetailField label="Email" value={employee.official_email ?? employee.personal_email} />
                      <DetailField label="Phone Number" value={employee.phone} />
                      <DetailField label="Date of Birth" value={employee.dob} />
                      <DetailField label="Gender" value={employee.gender} />
                    </div>
                  </div>
                ) : null}

                {activeTab === "employment" ? (
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Employment Details</h3>
                    <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                      <DetailField label="Designation" value={employee.designation} />
                      <DetailField label="Department" value={employee.department} />
                      <DetailField label="Manager" value={employee.manager} />
                      <DetailField label="Employment Type" value={employee.employment_type?.replace(/_/g, " ")} />
                      <DetailField label="Joining Date" value={employee.joining_date} />
                      <DetailField label="Status" value={employee.status} />
                    </div>
                  </div>
                ) : null}

                {activeTab === "contact" ? (
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Contact Information</h3>
                    <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                      <DetailField label="Official Email" value={employee.official_email} />
                      <DetailField label="Personal Email" value={employee.personal_email} />
                      <DetailField label="Phone Number" value={employee.phone} />
                    </div>
                  </div>
                ) : null}

                {activeTab === "banking" ? (
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Banking Details</h3>
                    <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                      <DetailField label="Bank Account Number" value={employee.bank_account_number} />
                      <DetailField label="IFSC Code" value={employee.ifsc_code} />
                      <DetailField label="PAN Number" value={employee.pan_number} />
                      <DetailField label="Aadhaar Number" value={employee.aadhaar_number} />
                      <DetailField label="UAN Number" value={employee.uan_number} />
                    </div>
                  </div>
                ) : null}

                {activeTab === "certifications" ? (
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Certifications</h3>
                    <div className="mt-4">
                      <EmptyState
                        title="No certifications on file"
                        description="Certification tracking isn't set up for this employee yet."
                      />
                    </div>
                  </div>
                ) : null}

                {activeTab === "documents" ? (
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Documents</h3>
                    <div className="mt-4">
                      {documentsQuery.isLoading ? <LoadingSkeleton rows={3} /> : null}
                      {documentsQuery.isError ? (
                        <EmptyState title="Unable to load documents" description="Employee documents could not be retrieved." />
                      ) : null}
                      {!documentsQuery.isLoading && !documentsQuery.isError && !(documentsQuery.data ?? []).length ? (
                        <EmptyState title="No documents uploaded" description="Documents added for this employee will appear here." />
                      ) : null}
                      <div className="space-y-2">
                        {(documentsQuery.data ?? []).map((doc: EmployeeDocumentRecord) => (
                          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{doc.document_type}</p>
                                <p className="text-xs text-muted-foreground">
                                  {doc.expiry_date ? `Expires ${doc.expiry_date}` : doc.created_at ?? ""}
                                </p>
                              </div>
                            </div>
                            <StatusBadge
                              status={doc.status.replace(/_/g, " ")}
                              tone={doc.status === "VERIFIED" ? "success" : doc.status === "REJECTED" ? "danger" : "neutral"}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </PageContainer>
    </AppLayout>
  );
}