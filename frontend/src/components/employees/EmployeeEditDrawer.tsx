import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawerPanel } from "@/components/ui-system";
import { getEmployee, getEmployeeFormOptions, updateEmployee, type EmployeeCreatePayload } from "@/services/employees";
import { getLookups } from "@/services/lookups";
import { getEmployeeTDSConfigs, getPayTypes } from "@/services/payroll";
import { EmployeeTDSModal } from "@/components/payroll/EmployeeTDSModal";

const emptyForm: Partial<EmployeeCreatePayload> = {};

const TABS = [
  { id: "personal", label: "Personal" },
  { id: "employment", label: "Employment" },
  { id: "bank", label: "Bank & Statutory" },
  { id: "payroll", label: "Payroll" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function EmployeeEditDrawer({ employeeId, open, onClose }: { employeeId: string | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<EmployeeCreatePayload>>(emptyForm);
  const [currentSalary, setCurrentSalary] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("personal");
  const [tdsModalOpen, setTdsModalOpen] = useState(false);
  const employeeQuery = useQuery({ queryKey: ["employee-detail", employeeId], queryFn: () => getEmployee(employeeId!), enabled: Boolean(open && employeeId) });
  const optionsQuery = useQuery({ queryKey: ["employee-form-options"], queryFn: getEmployeeFormOptions, enabled: open });
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "employee-form"],
    queryFn: () => getLookups(["employment_type", "employment_status", "gender"]),
    enabled: open,
  });
  const payTypesQuery = useQuery({ queryKey: ["pay-types-active"], queryFn: () => getPayTypes(true), enabled: open });
  const employmentTypeOptions: [string, string][] = (payTypesQuery.data && payTypesQuery.data.length > 0)
    ? payTypesQuery.data.map((pt) => [pt.code, pt.name])
    : (lookupsQuery.data?.employment_type ?? []).map((item) => [item.code, item.label]);
  const tdsConfigsQuery = useQuery({
    queryKey: ["employee-tds-config", employeeId],
    queryFn: () => getEmployeeTDSConfigs(employeeId!),
    enabled: Boolean(open && employeeId),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: Partial<EmployeeCreatePayload>) => updateEmployee(employeeId!, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-detail", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employee-onboarding-progress", employeeId] });
      onClose();
    },
  });

  useEffect(() => {
    const employee = employeeQuery.data;
    if (!employee) return;
    setForm({
      first_name: employee.first_name ?? "",
      last_name: employee.last_name ?? "",
      employee_code: employee.employee_code ?? "",
      joining_date: employee.joining_date ?? "",
      employment_status: employee.status ?? "",
      employment_type: employee.employment_type ?? "",
      department_id: employee.department_id ?? "",
      designation_id: employee.designation_id ?? "",
      reporting_manager_id: employee.reporting_manager_id ?? "",
      official_email: employee.official_email ?? "",
      personal_email: employee.personal_email ?? "",
      phone: employee.phone ?? "",
      dob: employee.dob ?? "",
      gender: employee.gender ?? "",
      address: employee.address ?? "",
      zip_code: employee.zip_code ?? "",
      city: employee.city ?? "",
      bank_account_number: employee.bank_account_number ?? "",
      ifsc_code: employee.ifsc_code ?? "",
      bank_branch: employee.bank_branch ?? "",
      emergency_code: employee.emergency_code ?? "",
      pan_number: employee.pan_number ?? "",
      aadhaar_number: employee.aadhaar_number ?? "",
      uan_number: employee.uan_number ?? "",
    });
    setCurrentSalary(employee.current_salary != null ? String(employee.current_salary) : "");
  }, [employeeQuery.data]);

  // Reset to the first tab each time the drawer is opened for a (possibly different) employee.
  useEffect(() => {
    if (open) setActiveTab("personal");
  }, [open, employeeId]);

  function setValue(key: keyof EmployeeCreatePayload, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const payload = {
    ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value])),
    current_salary: currentSalary === "" ? null : Number(currentSalary),
  } as Partial<EmployeeCreatePayload>;

  const isFormValid = Boolean(form.first_name?.trim());

  return (
    <DrawerPanel open={open} title="Update Employee" size="2xl" onClose={onClose}>
      {employeeQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading employee details...</p> : null}
      {employeeQuery.data ? (
        <div className="space-y-5">
          <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

          <div className={activeTab === "personal" ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
            <Field label="First name" required success={Boolean(form.first_name?.trim())}><Input value={form.first_name ?? ""} onChange={(event) => setValue("first_name", event.target.value)} /></Field>
            <Field label="Last name" required success={Boolean(form.last_name?.trim())}><Input value={form.last_name ?? ""} onChange={(event) => setValue("last_name", event.target.value)} /></Field>
            <Field label="Official email"><Input type="email" value={form.official_email ?? ""} onChange={(event) => setValue("official_email", event.target.value)} /></Field>
            <Field label="Personal email" required success={Boolean(form.personal_email?.trim())}><Input type="email" value={form.personal_email ?? ""} onChange={(event) => setValue("personal_email", event.target.value)} /></Field>
            <Field label="Phone" required success={Boolean(form.phone?.trim())}><Input value={form.phone ?? ""} onChange={(event) => setValue("phone", event.target.value)} /></Field>
            <Field label="Date of birth" required success={Boolean(form.dob?.trim())}><Input type="date" value={form.dob ?? ""} onChange={(event) => setValue("dob", event.target.value)} /></Field>
            <Field label="Gender" required success={Boolean(form.gender?.trim())}><Select value={form.gender} onChange={(value) => setValue("gender", value)} options={[["", "Not specified"], ...(lookupsQuery.data?.gender ?? []).map((item) => [item.code, item.label])]} /></Field>
            <Field label="Address" required success={Boolean(form.address?.trim())}><Input value={form.address ?? ""} onChange={(event) => setValue("address", event.target.value)} /></Field>
            <Field label="City" required success={Boolean(form.city?.trim())}><Input value={form.city ?? ""} onChange={(event) => setValue("city", event.target.value)} /></Field>
            <Field label="Zip code" required success={Boolean(form.zip_code?.trim())}><Input value={form.zip_code ?? ""} onChange={(event) => setValue("zip_code", event.target.value)} /></Field>
            <Field label="Emergency code" required success={Boolean(form.emergency_code?.trim())}><Input value={form.emergency_code ?? ""} onChange={(event) => setValue("emergency_code", event.target.value)} /></Field>
          </div>

          <div className={activeTab === "employment" ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
            <Field label="Employee code"><Input value={form.employee_code ?? ""} onChange={(event) => setValue("employee_code", event.target.value)} /></Field>
            <Field label="Joining date" required success={Boolean(form.joining_date?.trim())}><Input type="date" value={form.joining_date ?? ""} onChange={(event) => setValue("joining_date", event.target.value)} /></Field>
            <Field label="Employment type"><Select value={form.employment_type} onChange={(value) => setValue("employment_type", value)} options={[["", "Select employment type"], ...employmentTypeOptions]} /></Field>
            <Field label="Status"><Select value={form.employment_status} onChange={(value) => setValue("employment_status", value)} options={[["", "Select status"], ...(lookupsQuery.data?.employment_status ?? []).map((item) => [item.code, item.label])]} /></Field>
            <Field label="Department"><Select value={form.department_id} onChange={(value) => setValue("department_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.departments ?? []).map((item) => [item.id, item.name])]} /></Field>
            <Field label="Designation" required success={Boolean(form.designation_id?.trim())}><Select value={form.designation_id} onChange={(value) => setValue("designation_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.designations ?? []).map((item) => [item.id, item.name])]} /></Field>
            <Field label="Reporting manager"><Select value={form.reporting_manager_id} onChange={(value) => setValue("reporting_manager_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.managers ?? []).filter((item) => item.id !== employeeId).map((item) => [item.id, item.name])]} /></Field>
          </div>

          <div className={activeTab === "bank" ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
            <Field label="Bank account number" required success={Boolean(form.bank_account_number?.trim())}><Input value={form.bank_account_number ?? ""} onChange={(event) => setValue("bank_account_number", event.target.value)} /></Field>
            <Field label="IFSC code" required success={Boolean(form.ifsc_code?.trim())}><Input value={form.ifsc_code ?? ""} onChange={(event) => setValue("ifsc_code", event.target.value.toUpperCase())} /></Field>
            <Field label="Bank branch" required success={Boolean(form.bank_branch?.trim())}><Input value={form.bank_branch ?? ""} onChange={(event) => setValue("bank_branch", event.target.value)} /></Field>
            <Field label="PAN number" required success={Boolean(form.pan_number?.trim())}><Input value={form.pan_number ?? ""} onChange={(event) => setValue("pan_number", event.target.value.toUpperCase())} /></Field>
            <Field label="Aadhaar number" required success={Boolean(form.aadhaar_number?.trim())}><Input value={form.aadhaar_number ?? ""} onChange={(event) => setValue("aadhaar_number", event.target.value)} /></Field>
            <Field label="UAN number"><Input value={form.uan_number ?? ""} onChange={(event) => setValue("uan_number", event.target.value)} /></Field>
          </div>

          <div className={activeTab === "payroll" ? "space-y-5" : "hidden"}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Current salary">
                <Input
                  type="number"
                  min="0"
                  value={currentSalary}
                  onChange={(event) => setCurrentSalary(event.target.value)}
                />
              </Field>
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">TDS Configuration</span>
                <Button size="sm" variant="outline" onClick={() => setTdsModalOpen(true)}>
                  Add / Update TDS
                </Button>
              </div>
              {tdsConfigsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading TDS configuration...</p>
              ) : tdsConfigsQuery.data && tdsConfigsQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {tdsConfigsQuery.data.map((config) => (
                    <div key={config.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{config.financial_year}</span>
                        <span className="ml-2 text-muted-foreground">
                          ₹{config.monthly_tds.toLocaleString("en-IN")}/month
                          {config.tax_regime ? ` · ${config.tax_regime === "NEW" ? "New Regime" : "Old Regime"}` : ""}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">from {config.effective_from}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No TDS configuration on file yet.</p>
              )}
            </div>
          </div>

          {updateMutation.isError ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{updateMutation.error instanceof Error ? updateMutation.error.message : "Employee update could not be saved."}</p> : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!isFormValid || updateMutation.isPending} onClick={() => updateMutation.mutate(payload)}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      ) : null}

      {employeeId && employeeQuery.data ? (
        <EmployeeTDSModal
          open={tdsModalOpen}
          employeeId={employeeId}
          employeeName={`${employeeQuery.data.first_name ?? ""} ${employeeQuery.data.last_name ?? ""}`.trim() || employeeQuery.data.employee_code || "Employee"}
          onClose={() => {
            setTdsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["employee-tds-config", employeeId] });
          }}
        />
      ) : null}
    </DrawerPanel>
  );
}

function TabBar({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: TabId; label: string }>;
  activeTab: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={
              isActive
                ? "rounded-t-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                : "rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, required, error, success, hint, children }: { label: string; required?: boolean; error?: string; success?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="ml-1 text-rose-500 font-bold">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="block text-xs font-normal text-rose-600">{error}</span>
      ) : success ? (
        <span className="block text-xs font-normal text-emerald-600">Valid</span>
      ) : hint ? (
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function Select({ value, onChange, options }: { value?: string | null; onChange: (value: string) => void; options: string[][] }) {
  return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map(([id, label]) => <option key={`${id}-${label}`} value={id}>{label}</option>)}</select>;
}