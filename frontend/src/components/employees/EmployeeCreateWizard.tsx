import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Landmark, ShieldAlert, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawerPanel, StatusBadge } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { createEmployee, getEmployeeFormOptions, type EmployeeCreatePayload } from "@/services/employees";
import { getLookups } from "@/services/lookups";

const initialForm: EmployeeCreatePayload = {
  first_name: "",
  last_name: "",
  employee_code: "",
  joining_date: new Date().toISOString().slice(0, 10),
  employment_status: "",
  employment_type: "",
  department_id: "",
  designation_id: "",
  reporting_manager_id: "",
  official_email: "",
  personal_email: "",
  phone: "",
  dob: "",
  gender: "",
  bank_account_number: "",
  ifsc_code: "",
  pan_number: "",
  aadhaar_number: "",
  uan_number: "",
};

const initialEmergencyContact = {
  name: "",
  relationship: "",
  phone: "",
};

const steps = [
  { label: "Basic", icon: UserRound },
  { label: "Employment", icon: Building2 },
  { label: "Emergency Contact", icon: ShieldAlert },
  { label: "Banking", icon: Landmark },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

type StepErrors = Record<string, string>;
type EmergencyContactForm = typeof initialEmergencyContact;

function validateStep0(form: EmployeeCreatePayload): StepErrors {
  const errors: StepErrors = {};
  if (!form.first_name.trim()) {
    errors.first_name = "First name is required";
  }
  if (!form.last_name.trim()) {
    errors.last_name = "Last name is required";
  }
  if (!form.personal_email.trim()) {
    errors.personal_email = "Personal email is required";
  } else if (!isValidEmail(form.personal_email)) {
    errors.personal_email = "Enter a valid email address";
  }
  if (form.official_email && form.official_email.trim() && !isValidEmail(form.official_email)) {
    errors.official_email = "Enter a valid email address";
  }
  return errors;
}

function validateStep1(form: EmployeeCreatePayload): StepErrors {
  const errors: StepErrors = {};
  if (!form.joining_date) {
    errors.joining_date = "Joining date is required";
  }
  return errors;
}

export function EmployeeCreateWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContactForm>(initialEmergencyContact);
  const [currentSalary, setCurrentSalary] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const optionsQuery = useQuery({ queryKey: ["employee-form-options"], queryFn: getEmployeeFormOptions, enabled: open });
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "employee-form"],
    queryFn: () => getLookups(["employment_type", "employment_status", "gender"]),
    enabled: open,
  });
  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      setForm(initialForm);
      setEmergencyContact(initialEmergencyContact);
      setCurrentSalary("");
      setStep(0);
      setShowErrors(false);
      onClose();
    },
  });

  function setValue(key: keyof EmployeeCreatePayload, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setEmergencyContactValue(key: keyof EmergencyContactForm, value: string) {
    setEmergencyContact((current) => ({ ...current, [key]: value }));
  }

  const step0Errors = validateStep0(form);
  const step1Errors = validateStep1(form);
  const allErrors = { ...step0Errors, ...step1Errors };

  const canContinue = step === 0 ? Object.keys(step0Errors).length === 0 : step === 1 ? Object.keys(step1Errors).length === 0 : true;
  const canSubmit = Object.keys(allErrors).length === 0;

  const bankingReady = Boolean(form.bank_account_number && form.ifsc_code);

  function buildPayload(): EmployeeCreatePayload {
    const sanitizedBase = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value === "" ? undefined : value]),
    ) as EmployeeCreatePayload;

    const trimmedEmergencyContact = {
      name: emergencyContact.name.trim(),
      relationship: emergencyContact.relationship.trim(),
      phone: emergencyContact.phone.trim(),
    };
    const hasEmergencyContact = Object.values(trimmedEmergencyContact).some(Boolean);

    return {
      ...sanitizedBase,
      current_salary: currentSalary.trim() ? Number(currentSalary) : undefined,
      emergency_contact: hasEmergencyContact ? trimmedEmergencyContact : undefined,
    };
  }

  function handleContinue() {
    if (!canContinue) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((value) => value + 1);
  }

  function handleSubmit() {
    if (!canSubmit) {
      setShowErrors(true);
      return;
    }
    createMutation.mutate(buildPayload());
  }

  return (
        <DrawerPanel open={open} title="Create Employee" size="2xl" onClose={onClose}>
        <div className="space-y-5">
        <div className="grid grid-cols-4 gap-2">
          {steps.map(({ label, icon: Icon }, index) => (
            <div key={label} className={cn("rounded-md border px-2 py-3 text-center", index === step ? "border-primary bg-primary/5 text-primary" : index < step ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-muted-foreground")}>
              <Icon className="mx-auto h-4 w-4" />
              <p className="mt-1 text-xs font-medium">{label}</p>
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-4">
            <WizardHeading title="Basic Information" description="Identity, contact information, and the auto-generated employee ID." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" required error={showErrors ? step0Errors.first_name : undefined}>
                <Input value={form.first_name} onChange={(event) => setValue("first_name", event.target.value)} placeholder="e.g. John" />
              </Field>
              <Field label="Last name" required error={showErrors ? step0Errors.last_name : undefined}>
                <Input value={form.last_name} onChange={(event) => setValue("last_name", event.target.value)} placeholder="e.g. Doe" />
              </Field>
              <Field label="Employee ID" hint="Auto-generated on save">
                <Input value="" disabled placeholder="Auto-generated on save" />
              </Field>
              <Field label="Official email" error={showErrors ? step0Errors.official_email : undefined}>
                <Input type="email" value={form.official_email} onChange={(event) => setValue("official_email", event.target.value)} placeholder="e.g. john@example.com" />
              </Field>
              <Field label="Personal email" required error={showErrors ? step0Errors.personal_email : undefined}>
                <Input type="email" value={form.personal_email} onChange={(event) => setValue("personal_email", event.target.value)} placeholder="e.g. john@example.com" />
              </Field>
              <Field label="Phone number"><Input value={form.phone} onChange={(event) => setValue("phone", event.target.value)} placeholder="e.g. +1 234 567 8900" /></Field>
              <Field label="Date of birth"><Input type="date" value={form.dob} onChange={(event) => setValue("dob", event.target.value)} /></Field>
              <Field label="Gender"><Select value={form.gender} onChange={(value) => setValue("gender", value)} options={[["", "Not specified"], ...(lookupsQuery.data?.gender ?? []).map((item) => [item.code, item.label])]} /></Field>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <WizardHeading title="Employment Details" description="Position, reporting line, and joining information." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Department"><Select value={form.department_id} onChange={(value) => setValue("department_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.departments ?? []).map((item) => [item.id, item.name])]} /></Field>
              <Field label="Designation"><Select value={form.designation_id} onChange={(value) => setValue("designation_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.designations ?? []).map((item) => [item.id, item.name])]} /></Field>
              <Field label="Reporting manager"><Select value={form.reporting_manager_id} onChange={(value) => setValue("reporting_manager_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.managers ?? []).map((item) => [item.id, item.name])]} /></Field>
              <Field label="Date of joining" required error={showErrors ? step1Errors.joining_date : undefined}>
                <Input type="date" value={form.joining_date} onChange={(event) => setValue("joining_date", event.target.value)} />
              </Field>
              <Field label="Employment type"><Select value={form.employment_type} onChange={(value) => setValue("employment_type", value)} options={[["", "Select employment type"], ...(lookupsQuery.data?.employment_type ?? []).map((item) => [item.code, item.label])]} /></Field>
              <Field label="Employee status"><Select value={form.employment_status} onChange={(value) => setValue("employment_status", value)} options={[["", "Select status"], ...(lookupsQuery.data?.employment_status ?? []).map((item) => [item.code, item.label])]} /></Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <WizardHeading title="Emergency Contact" description="Who to reach in case of an emergency. Optional, but recommended." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={emergencyContact.name} onChange={(event) => setEmergencyContactValue("name", event.target.value)} placeholder="e.g. Jane Doe" /></Field>
              <Field label="Relationship"><Input value={emergencyContact.relationship} onChange={(event) => setEmergencyContactValue("relationship", event.target.value)} placeholder="e.g. Spouse, Parent, Sibling" /></Field>
              <Field label="Phone number"><Input value={emergencyContact.phone} onChange={(event) => setEmergencyContactValue("phone", event.target.value)} placeholder="e.g. +1 234 567 8900" /></Field>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <WizardHeading title="Banking Information" description="Bank and statutory details, and the base salary." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bank account number"><Input value={form.bank_account_number} onChange={(event) => setValue("bank_account_number", event.target.value)} placeholder="e.g. 1234567890" /></Field>
              <Field label="IFSC code"><Input value={form.ifsc_code} onChange={(event) => setValue("ifsc_code", event.target.value.toUpperCase())} placeholder="e.g. HDFC0001234" /></Field>
              <Field label="PAN number"><Input value={form.pan_number} onChange={(event) => setValue("pan_number", event.target.value.toUpperCase())} placeholder="e.g. ABCDE1234F" /></Field>
              <Field label="Aadhaar number"><Input value={form.aadhaar_number} onChange={(event) => setValue("aadhaar_number", event.target.value)} placeholder="e.g. 1234 5678 9012" /></Field>
              <Field label="UAN number"><Input value={form.uan_number} onChange={(event) => setValue("uan_number", event.target.value)} placeholder="e.g. 100123456789" /></Field>
              <Field label="Base salary"><Input type="number" min="0" step="0.01" value={currentSalary} onChange={(event) => setCurrentSalary(event.target.value)} placeholder="e.g. 50000.00" /></Field>
            </div>
            <div className="rounded-md border bg-muted/40 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold">Creation summary</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge status={`${form.first_name} ${form.last_name}`.trim()} tone="info" />
                <StatusBadge status={form.employment_type.replace(/_/g, " ")} tone="neutral" />
                <StatusBadge status={bankingReady ? "Bank details ready" : "Bank details incomplete"} tone={bankingReady ? "success" : "warning"} />
                <StatusBadge status={currentSalary.trim() ? "Salary set" : "Salary not set"} tone={currentSalary.trim() ? "success" : "warning"} />
              </div>
            </div>
          </div>
        ) : null}

        {createMutation.isError ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Employee could not be created. Check required and unique fields.</p> : null}
        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={() => step === 0 ? onClose() : setStep((value) => value - 1)}>
            <ArrowLeft className="h-4 w-4" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={handleContinue}>Continue <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button disabled={createMutation.isPending} onClick={handleSubmit}>
              {createMutation.isPending ? "Creating..." : "Create Employee"}
            </Button>
          )}
        </div>
      </div>
    </DrawerPanel>
  );
}

function WizardHeading({ title, description }: { title: string; description: string }) {
  return <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-medium">{label}{required ? " *" : ""}</span>
      {children}
      {error ? <span className="block text-xs font-normal text-rose-600">{error}</span> : hint ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Select({ value, onChange, options }: { value?: string; onChange: (value: string) => void; options: string[][] }) {
  return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map(([id, label]) => <option key={`${id}-${label}`} value={id}>{label}</option>)}</select>;
}