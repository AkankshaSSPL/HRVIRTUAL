import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawerPanel } from "@/components/ui-system";
import { getEmployee, getEmployeeFormOptions, updateEmployee, type EmployeeCreatePayload } from "@/services/employees";
import { getLookups } from "@/services/lookups";
import { getEmployeeTDSConfigs, getPayTypes, previewSalaryBreakdown } from "@/services/payroll";
import { EmployeeTDSModal } from "@/components/payroll/EmployeeTDSModal";
import { SeatingAllocationModal } from "@/components/employees/SeatingAllocationModal";
import { validateEmployeeForm } from "@/utils/validators";

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
  const [seatModalOpen, setSeatModalOpen] = useState(false);
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
  const tdsConfigsQuery = useQuery({ queryKey: ["employee-tds", employeeId], queryFn: () => getEmployeeTDSConfigs(employeeId!), enabled: Boolean(open && employeeId) });

  const [debouncedSalary, setDebouncedSalary] = useState(currentSalary);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSalary(currentSalary), 500);
    return () => clearTimeout(handler);
  }, [currentSalary]);

  const previewQuery = useQuery({
    queryKey: ["salary-preview", employeeId, debouncedSalary],
    queryFn: () => previewSalaryBreakdown(employeeId!, Number(debouncedSalary)),
    enabled: Boolean(open && employeeId && debouncedSalary && Number(debouncedSalary) > 0),
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
    ...Object.fromEntries(
      Object.entries(form)
        .filter(([_, value]) => typeof value !== "string" || !value.includes("*"))
        .map(([key, value]) => [key, value === "" ? null : value])
    ),
    current_salary: currentSalary === "" ? null : Number(currentSalary),
  } as Partial<EmployeeCreatePayload>;

  const errors = validateEmployeeForm(form, true);
  const isFormValid = Object.keys(errors).length === 0;

  return (
    <DrawerPanel open={open} title="Update Employee" size="2xl" onClose={onClose}>
      <div className="absolute right-16 top-4">
        {employeeId ? (
          <Button size="sm" variant="outline" onClick={() => setSeatModalOpen(true)}>
            Allocate Seating and Assets
          </Button>
        ) : null}
      </div>
      {employeeQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading employee details...</p> : null}
      {employeeQuery.data ? (
        <div className="space-y-5">
          <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

          <div className={activeTab === "personal" ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
            <Field label="First name" required error={errors.first_name} success={!errors.first_name && Boolean(form.first_name?.trim())}><Input value={form.first_name ?? ""} onChange={(event) => setValue("first_name", event.target.value)} /></Field>
            <Field label="Last name" required error={errors.last_name} success={!errors.last_name && Boolean(form.last_name?.trim())}><Input value={form.last_name ?? ""} onChange={(event) => setValue("last_name", event.target.value)} /></Field>
            <Field label="Official email" required error={errors.official_email} success={!errors.official_email && Boolean(form.official_email?.trim())}><Input type="email" value={form.official_email ?? ""} onChange={(event) => setValue("official_email", event.target.value)} /></Field>
            <Field label="Personal email" required error={errors.personal_email} success={!errors.personal_email && Boolean(form.personal_email?.trim())}><Input type="email" value={form.personal_email ?? ""} onChange={(event) => setValue("personal_email", event.target.value)} /></Field>
            <Field label="Phone" required error={errors.phone} success={!errors.phone && Boolean(form.phone?.trim())}><Input value={form.phone ?? ""} onChange={(event) => setValue("phone", event.target.value)} /></Field>
            <Field label="Date of birth" required error={errors.dob} success={!errors.dob && Boolean(form.dob?.trim())}><Input type="date" value={form.dob ?? ""} onChange={(event) => setValue("dob", event.target.value)} /></Field>
            <Field label="Gender" required error={errors.gender} success={!errors.gender && Boolean(form.gender?.trim())}><Select value={form.gender} onChange={(value) => setValue("gender", value)} options={[["", "Not specified"], ...(lookupsQuery.data?.gender ?? []).map((item) => [item.code, item.label])]} /></Field>
            <Field label="Address" required error={errors.address} success={!errors.address && Boolean(form.address?.trim())}><Input value={form.address ?? ""} onChange={(event) => setValue("address", event.target.value)} /></Field>
            <Field label="City" required error={errors.city} success={!errors.city && Boolean(form.city?.trim())}><Input value={form.city ?? ""} onChange={(event) => setValue("city", event.target.value)} /></Field>
            <Field label="Zip code" required error={errors.zip_code} success={!errors.zip_code && Boolean(form.zip_code?.trim())}><Input value={form.zip_code ?? ""} onChange={(event) => setValue("zip_code", event.target.value)} /></Field>
          </div>

          <div className={activeTab === "employment" ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
            <Field label="Employee code" error={errors.employee_code}><Input value={form.employee_code ?? ""} onChange={(event) => setValue("employee_code", event.target.value)} /></Field>
            <Field label="Joining date" required error={errors.joining_date} success={!errors.joining_date && Boolean(form.joining_date?.trim())}><Input type="date" value={form.joining_date ?? ""} onChange={(event) => setValue("joining_date", event.target.value)} /></Field>
            <Field label="Employment type" error={errors.employment_type}><Select value={form.employment_type} onChange={(value) => setValue("employment_type", value)} options={[["", "Select employment type"], ...employmentTypeOptions]} /></Field>
            <Field label="Status" error={errors.employment_status}><Select value={form.employment_status} onChange={(value) => setValue("employment_status", value)} options={[["", "Select status"], ...(lookupsQuery.data?.employment_status ?? []).map((item) => [item.code, item.label])]} /></Field>
            <Field label="Department" error={errors.department_id}><Select value={form.department_id} onChange={(value) => setValue("department_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.departments ?? []).map((item) => [item.id, item.name])]} /></Field>
            <Field label="Designation" required error={errors.designation_id} success={!errors.designation_id && Boolean(form.designation_id?.trim())}><Select value={form.designation_id} onChange={(value) => setValue("designation_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.designations ?? []).map((item) => [item.id, item.name])]} /></Field>
            <Field label="Reporting manager" error={errors.reporting_manager_id}><Select value={form.reporting_manager_id} onChange={(value) => setValue("reporting_manager_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.managers ?? []).filter((item) => item.id !== employeeId).map((item) => [item.id, item.name])]} /></Field>
          </div>

          <div className={activeTab === "bank" ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
            <Field label="Bank account number" required error={errors.bank_account_number} success={!errors.bank_account_number && Boolean(form.bank_account_number?.trim())}><Input value={form.bank_account_number ?? ""} onChange={(event) => setValue("bank_account_number", event.target.value)} /></Field>
            <Field label="IFSC code" required error={errors.ifsc_code} success={!errors.ifsc_code && Boolean(form.ifsc_code?.trim())}><Input value={form.ifsc_code ?? ""} onChange={(event) => setValue("ifsc_code", event.target.value.toUpperCase())} /></Field>
            <Field label="Bank branch" required error={errors.bank_branch} success={!errors.bank_branch && Boolean(form.bank_branch?.trim())}><Input value={form.bank_branch ?? ""} onChange={(event) => setValue("bank_branch", event.target.value)} /></Field>
            <Field label="PAN number" required error={errors.pan_number} success={!errors.pan_number && Boolean(form.pan_number?.trim())}><Input value={form.pan_number ?? ""} onChange={(event) => setValue("pan_number", event.target.value.toUpperCase())} /></Field>
            <Field label="Aadhaar number" required error={errors.aadhaar_number} success={!errors.aadhaar_number && Boolean(form.aadhaar_number?.trim())}><Input value={form.aadhaar_number ?? ""} onChange={(event) => setValue("aadhaar_number", event.target.value)} /></Field>
            <Field label="UAN number" error={errors.uan_number} success={!errors.uan_number && Boolean(form.uan_number?.trim())}><Input value={form.uan_number ?? ""} onChange={(event) => setValue("uan_number", event.target.value)} /></Field>
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

              {/* Salary Breakdown Preview */}
              {previewQuery.isFetching ? (
                <p className="mt-4 text-sm text-muted-foreground">Calculating breakdown...</p>
              ) : previewQuery.data && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold mb-3">Salary Breakdown Preview</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Earnings Card */}
                    <div className="rounded-md border border-slate-200 border-l-4 border-l-emerald-500 p-4 bg-white shadow-sm flex flex-col">
                      <h5 className="text-sm font-bold text-emerald-600 mb-4">Earnings</h5>
                      <div className="space-y-3 flex-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Basic Salary</span>
                          <span className="font-medium text-slate-900">₹{(previewQuery.data.earnings["BASIC"] || previewQuery.data.earnings["BASE_PAY"] || previewQuery.data.earnings["MONTHLY_FEE"] || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Component Earnings</span>
                          <span className="font-medium text-blue-600">₹{Object.entries(previewQuery.data.earnings).filter(([key]) => !["BASIC", "BASE_PAY", "MONTHLY_FEE", "OVERTIME"].includes(key)).reduce((sum, [_, val]) => sum + Number(val), 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {previewQuery.data.earnings["OVERTIME"] ? (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600">Overtime</span>
                            <span className="font-medium text-emerald-600">₹{Number(previewQuery.data.earnings["OVERTIME"]).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold border-t pt-3 mt-4">
                        <span className="text-slate-900">Gross Pay</span>
                        <span className="text-emerald-600">₹{Object.values(previewQuery.data.earnings).reduce((sum, val) => sum + Number(val), 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    {/* Deductions Card */}
                    <div className="rounded-md border border-slate-200 border-l-4 border-l-rose-500 p-4 bg-white shadow-sm flex flex-col">
                      <h5 className="text-sm font-bold text-rose-600 mb-4">Deductions</h5>
                      <div className="space-y-3 flex-1">
                        {previewQuery.data.deductions["LEAVE_DEDUCTION"] ? (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600">LOP Deduction</span>
                            <span className="font-medium text-rose-600">₹{Number(previewQuery.data.deductions["LEAVE_DEDUCTION"]).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Component Deductions</span>
                          <span className="font-medium text-rose-600">₹{Object.entries(previewQuery.data.deductions).filter(([key]) => key !== "LEAVE_DEDUCTION").reduce((sum, [_, val]) => sum + Number(val), 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold border-t pt-3 mt-4">
                        <span className="text-slate-900">Net Pay</span>
                        <span className="text-emerald-600">₹{(previewQuery.data.net_pay || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
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
      {employeeId && <SeatingAllocationModal employeeId={employeeId} open={seatModalOpen} onClose={() => setSeatModalOpen(false)} />}
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