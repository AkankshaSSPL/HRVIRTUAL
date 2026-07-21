import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawerPanel } from "@/components/ui-system";
import { getEmployee, getEmployeeFormOptions, updateEmployee, type EmployeeCreatePayload } from "@/services/employees";
import { getLookups } from "@/services/lookups";

const emptyForm: Partial<EmployeeCreatePayload> = {};

export function EmployeeEditDrawer({ employeeId, open, onClose }: { employeeId: string | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<EmployeeCreatePayload>>(emptyForm);
  const employeeQuery = useQuery({ queryKey: ["employee-detail", employeeId], queryFn: () => getEmployee(employeeId!), enabled: Boolean(open && employeeId) });
  const optionsQuery = useQuery({ queryKey: ["employee-form-options"], queryFn: getEmployeeFormOptions, enabled: open });
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "employee-form"],
    queryFn: () => getLookups(["employment_type", "employment_status", "gender"]),
    enabled: open,
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
      bank_account_number: employee.bank_account_number ?? "",
      ifsc_code: employee.ifsc_code ?? "",
      pan_number: employee.pan_number ?? "",
      aadhaar_number: employee.aadhaar_number ?? "",
      uan_number: employee.uan_number ?? "",
    });
  }, [employeeQuery.data]);

  function setValue(key: keyof EmployeeCreatePayload, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value])) as Partial<EmployeeCreatePayload>;

  return (
    <DrawerPanel open={open} title="Update Employee" size="2xl" onClose={onClose}>
      {employeeQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading employee details...</p> : null}
      {employeeQuery.data ? (
        <div className="space-y-5">
          <FormSection title="Personal details">
            <Field label="First name"><Input value={form.first_name ?? ""} onChange={(event) => setValue("first_name", event.target.value)} /></Field>
            <Field label="Last name"><Input value={form.last_name ?? ""} onChange={(event) => setValue("last_name", event.target.value)} /></Field>
            <Field label="Official email"><Input type="email" value={form.official_email ?? ""} onChange={(event) => setValue("official_email", event.target.value)} /></Field>
            <Field label="Personal email"><Input type="email" value={form.personal_email ?? ""} onChange={(event) => setValue("personal_email", event.target.value)} /></Field>
            <Field label="Phone"><Input value={form.phone ?? ""} onChange={(event) => setValue("phone", event.target.value)} /></Field>
            <Field label="Date of birth"><Input type="date" value={form.dob ?? ""} onChange={(event) => setValue("dob", event.target.value)} /></Field>
            <Field label="Gender"><Select value={form.gender} onChange={(value) => setValue("gender", value)} options={[["", "Not specified"], ...(lookupsQuery.data?.gender ?? []).map((item) => [item.code, item.label])]} /></Field>
          </FormSection>
          <FormSection title="Employment details">
            <Field label="Employee code"><Input value={form.employee_code ?? ""} onChange={(event) => setValue("employee_code", event.target.value)} /></Field>
            <Field label="Joining date"><Input type="date" value={form.joining_date ?? ""} onChange={(event) => setValue("joining_date", event.target.value)} /></Field>
            <Field label="Employment type"><Select value={form.employment_type} onChange={(value) => setValue("employment_type", value)} options={[["", "Select employment type"], ...(lookupsQuery.data?.employment_type ?? []).map((item) => [item.code, item.label])]} /></Field>
            <Field label="Status"><Select value={form.employment_status} onChange={(value) => setValue("employment_status", value)} options={[["", "Select status"], ...(lookupsQuery.data?.employment_status ?? []).map((item) => [item.code, item.label])]} /></Field>
            <Field label="Department"><Select value={form.department_id} onChange={(value) => setValue("department_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.departments ?? []).map((item) => [item.id, item.name])]} /></Field>
            <Field label="Designation"><Select value={form.designation_id} onChange={(value) => setValue("designation_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.designations ?? []).map((item) => [item.id, item.name])]} /></Field>
            <Field label="Reporting manager"><Select value={form.reporting_manager_id} onChange={(value) => setValue("reporting_manager_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.managers ?? []).filter((item) => item.id !== employeeId).map((item) => [item.id, item.name])]} /></Field>
          </FormSection>
          <FormSection title="Bank and statutory details">
            <Field label="Bank account number"><Input value={form.bank_account_number ?? ""} onChange={(event) => setValue("bank_account_number", event.target.value)} /></Field>
            <Field label="IFSC code"><Input value={form.ifsc_code ?? ""} onChange={(event) => setValue("ifsc_code", event.target.value.toUpperCase())} /></Field>
            <Field label="PAN number"><Input value={form.pan_number ?? ""} onChange={(event) => setValue("pan_number", event.target.value.toUpperCase())} /></Field>
            <Field label="Aadhaar number"><Input value={form.aadhaar_number ?? ""} onChange={(event) => setValue("aadhaar_number", event.target.value)} /></Field>
            <Field label="UAN number"><Input value={form.uan_number ?? ""} onChange={(event) => setValue("uan_number", event.target.value)} /></Field>
          </FormSection>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Salary changes are excluded here and must continue through the salary approval workflow.</p>
          {updateMutation.isError ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Employee update could not be saved.</p> : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={updateMutation.isPending || !form.first_name || !form.joining_date} onClick={() => updateMutation.mutate(payload)}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      ) : null}
    </DrawerPanel>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h3 className="border-b pb-2 text-sm font-semibold">{title}</h3><div className="grid gap-3 sm:grid-cols-2">{children}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}

function Select({ value, onChange, options }: { value?: string | null; onChange: (value: string) => void; options: string[][] }) {
  return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map(([id, label]) => <option key={`${id}-${label}`} value={id}>{label}</option>)}</select>;
}