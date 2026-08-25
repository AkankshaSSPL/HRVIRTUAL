import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Landmark, MapPin, ShieldAlert, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawerPanel, StatusBadge } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { createEmployee, getEmployeeFormOptions, type EmployeeCreatePayload } from "@/services/employees";
import { getLookups } from "@/services/lookups";
import { getPayTypes } from "@/services/payroll";

const initialForm = {
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
  address: "",
  zip_code: "",
  city: "",
  bank_account_number: "",
  ifsc_code: "",
  bank_branch: "",
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
  { label: "Address & Location", icon: MapPin },
  { label: "Emergency Contact", icon: ShieldAlert },
  { label: "Banking", icon: Landmark },
];

function isAllDigits(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str[i] < '0' || str[i] > '9') return false;
  }
  return true;
}

function isValidEmail(value: string): boolean {
  const parts = value.trim().split('@');
  if (parts.length !== 2) return false;
  if (!parts[1].includes('.')) return false;
  if (parts[0].length === 0 || parts[1].length < 3) return false;
  return true;
}

type StepErrors = Record<string, string>;
type EmergencyContactForm = typeof initialEmergencyContact;

function validateStep0(form: typeof initialForm): StepErrors {
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
  if (!form.official_email.trim()) {
    errors.official_email = "Official email is required";
  } else if (!isValidEmail(form.official_email)) {
    errors.official_email = "Enter a valid email address";
  }
  if (!form.phone?.trim()) {
    errors.phone = "Phone number is required";
  } else {
    const v = form.phone.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length !== 10) {
      errors.phone = "Must be exactly 10 digits";
    }
  }
  if (!form.dob?.trim()) {
    errors.dob = "Date of birth is required";
  } else {
    const dobDate = new Date(form.dob);
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const m = today.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
      age--;
    }
    if (age < 18) {
      errors.dob = "Employee must be at least 18 years old";
    }
  }
  if (!form.gender?.trim()) {
    errors.gender = "Gender is required";
  }
  return errors;
}

function validateStep1(form: typeof initialForm): StepErrors {
  const errors: StepErrors = {};
  if (!form.joining_date) {
    errors.joining_date = "Joining date is required";
  }
  if (!form.designation_id?.trim()) {
    errors.designation_id = "Designation is required";
  }
  return errors;
}

function validateStep2(form: typeof initialForm): StepErrors {
  const errors: StepErrors = {};
  if (!form.address?.trim()) {
    errors.address = "Address is required";
  }
  if (!form.city?.trim()) {
    errors.city = "City is required";
  }
  if (!form.zip_code?.trim()) {
    errors.zip_code = "Zip code is required";
  } else {
    const v = form.zip_code.trim();
    if (!isAllDigits(v) || v.length !== 6) {
      errors.zip_code = "Must be exactly 6 digits";
    }
  }
  return errors;
}

function validateStep3(emergencyContact: EmergencyContactForm): StepErrors {
  const errors: StepErrors = {};
  if (!emergencyContact.name.trim()) {
    errors.name = "Name is required";
  }
  if (!emergencyContact.relationship.trim()) {
    errors.relationship = "Relationship is required";
  }
  if (!emergencyContact.phone.trim()) {
    errors.phone = "Phone number is required";
  } else {
    const v = emergencyContact.phone.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length !== 10) {
      errors.phone = "Must be exactly 10 digits";
    }
  }
  return errors;
}

function validateStep4(form: typeof initialForm): StepErrors {
  const errors: StepErrors = {};
  if (!form.bank_account_number?.trim()) {
    errors.bank_account_number = "Bank account number is required";
  } else {
    const v = form.bank_account_number.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length < 9 || v.length > 12) {
      errors.bank_account_number = "Must be between 9 and 12 digits";
    }
  }
  
  if (!form.ifsc_code?.trim()) {
    errors.ifsc_code = "IFSC code is required";
  } else {
    const v = form.ifsc_code.trim().toUpperCase();
    let valid = true;
    if (v.length !== 11 || v[4] !== '0') valid = false;
    for (let i = 0; i < 4 && valid; i++) if (v[i] < 'A' || v[i] > 'Z') valid = false;
    for (let i = 5; i < 11 && valid; i++) {
        const c = v[i];
        if (!((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))) valid = false;
    }
    if (!valid) {
      errors.ifsc_code = "Invalid IFSC code format";
    }
  }
  
  if (!form.bank_branch?.trim()) {
    errors.bank_branch = "Bank branch is required";
  }
  
  if (!form.pan_number?.trim()) {
    errors.pan_number = "PAN number is required";
  } else {
    const v = form.pan_number.trim().toUpperCase();
    let valid = true;
    if (v.length !== 10) valid = false;
    for (let i = 0; i < 5 && valid; i++) if (v[i] < 'A' || v[i] > 'Z') valid = false;
    for (let i = 5; i < 9 && valid; i++) if (v[i] < '0' || v[i] > '9') valid = false;
    if (valid && (v[9] < 'A' || v[9] > 'Z')) valid = false;
    
    if (!valid) {
      errors.pan_number = "Invalid PAN number format (e.g. ABCDE1234F)";
    }
  }
  
  if (!form.aadhaar_number?.trim()) {
    errors.aadhaar_number = "Aadhaar number is required";
  } else {
    const v = form.aadhaar_number.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length !== 12) {
      errors.aadhaar_number = "Must be exactly 12 digits";
    }
  }

  if (form.uan_number?.trim()) {
    const v = form.uan_number.replace(/[\s-]/g, "");
    if (!isAllDigits(v) || v.length !== 12) {
      errors.uan_number = "Must be exactly 12 digits";
    }
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
  const payTypesQuery = useQuery({ queryKey: ["pay-types-active"], queryFn: () => getPayTypes(true), enabled: open });
  const employmentTypeOptions: [string, string][] = (payTypesQuery.data && payTypesQuery.data.length > 0)
    ? payTypesQuery.data.map((pt) => [pt.code, pt.name])
    : (lookupsQuery.data?.employment_type ?? []).map((item) => [item.code, item.label]);
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

  function setValue(key: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setEmergencyContactValue(key: keyof EmergencyContactForm, value: string) {
    setEmergencyContact((current) => ({ ...current, [key]: value }));
  }

  const step0Errors = validateStep0(form);
  const step1Errors = validateStep1(form);
  const step2Errors = validateStep2(form);
  const step3Errors = validateStep3(emergencyContact);
  const step4Errors = validateStep4(form);
  const allErrors = { ...step0Errors, ...step1Errors, ...step2Errors, ...step3Errors, ...step4Errors };

  const canContinue =
    step === 0 ? Object.keys(step0Errors).length === 0 :
    step === 1 ? Object.keys(step1Errors).length === 0 :
    step === 2 ? Object.keys(step2Errors).length === 0 :
    step === 3 ? Object.keys(step3Errors).length === 0 :
    true;
  const canSubmit = Object.keys(allErrors).length === 0;

  const bankingReady = Boolean(form.bank_account_number && form.ifsc_code && form.bank_branch);

  function buildPayload(): EmployeeCreatePayload {
    const sanitizedBase = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value === "" ? undefined : value]),
    ) as unknown as EmployeeCreatePayload;

    const trimmedEmergencyContact = {
      name: emergencyContact.name.trim(),
      relationship: emergencyContact.relationship.trim(),
      phone: emergencyContact.phone.trim(),
    };

    return {
      ...sanitizedBase,
      current_salary: currentSalary.trim() ? Number(currentSalary) : undefined,
      emergency_contact: trimmedEmergencyContact,
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
        <div className="grid grid-cols-5 gap-2">
          {steps.map(({ label, icon: Icon }, index) => (
            <div key={label} className={cn("rounded-md border px-2 py-3 text-center", index === step ? "border-primary bg-primary/5 text-primary" : index < step ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-muted-foreground")}>
              <Icon className="mx-auto h-4 w-4" />
              <p className="mt-1 text-xs font-medium">{label}</p>
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-4">
            <WizardHeading title="Basic Information" description="Identity, contact information, and personal details." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" required error={showErrors ? step0Errors.first_name : undefined} success={Boolean(form.first_name?.trim())}>
                <Input value={form.first_name} onChange={(event) => setValue("first_name", event.target.value)} placeholder="e.g. John" />
              </Field>
              <Field label="Last name" required error={showErrors ? step0Errors.last_name : undefined} success={Boolean(form.last_name?.trim())}>
                <Input value={form.last_name} onChange={(event) => setValue("last_name", event.target.value)} placeholder="e.g. Doe" />
              </Field>
              <Field label="Employee ID" hint="Auto-generated on save">
                <Input value="" disabled placeholder="Auto-generated on save" />
              </Field>
              <Field label="Official email" required error={showErrors ? step0Errors.official_email : undefined}>
                <Input type="email" value={form.official_email} onChange={(event) => setValue("official_email", event.target.value)} placeholder="e.g. john@example.com" />
              </Field>
              <Field label="Personal email" required error={showErrors ? step0Errors.personal_email : undefined} success={Boolean(form.personal_email?.trim())}>
                <Input type="email" value={form.personal_email} onChange={(event) => setValue("personal_email", event.target.value)} placeholder="e.g. john@example.com" />
              </Field>
              <Field label="Phone number" required error={showErrors ? step0Errors.phone : undefined} success={Boolean(form.phone?.trim())}>
                <Input value={form.phone} onChange={(event) => setValue("phone", event.target.value)} placeholder="e.g. +1 234 567 8900" />
              </Field>
              <Field label="Date of birth" required error={showErrors ? step0Errors.dob : undefined} success={Boolean(form.dob?.trim())}>
                <Input type="date" value={form.dob} onChange={(event) => setValue("dob", event.target.value)} />
              </Field>
              <Field label="Gender" required error={showErrors ? step0Errors.gender : undefined} success={Boolean(form.gender?.trim())}>
                <Select value={form.gender} onChange={(value) => setValue("gender", value)} options={[["", "Not specified"], ...(lookupsQuery.data?.gender ?? []).map((item) => [item.code, item.label])]} />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <WizardHeading title="Employment Details" description="Position, reporting line, and joining information." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Department">
                <Select value={form.department_id} onChange={(value) => setValue("department_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.departments ?? []).map((item) => [item.id, item.name])]} />
              </Field>
              <Field label="Designation" required error={showErrors ? step1Errors.designation_id : undefined} success={Boolean(form.designation_id?.trim())}>
                <Select value={form.designation_id} onChange={(value) => setValue("designation_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.designations ?? []).map((item) => [item.id, item.name])]} />
              </Field>
              <Field label="Reporting manager">
                <Select value={form.reporting_manager_id} onChange={(value) => setValue("reporting_manager_id", value)} options={[["", "Unassigned"], ...(optionsQuery.data?.managers ?? []).map((item) => [item.id, item.name])]} />
              </Field>
              <Field label="Date of joining" required error={showErrors ? step1Errors.joining_date : undefined} success={Boolean(form.joining_date?.trim())}>
                <Input type="date" value={form.joining_date} onChange={(event) => setValue("joining_date", event.target.value)} />
              </Field>
              <Field label="Employment type">
                <Select value={form.employment_type} onChange={(value) => setValue("employment_type", value)} options={[["", "Select employment type"], ...employmentTypeOptions]} />
              </Field>
              <Field label="Employee status">
                <Select value={form.employment_status} onChange={(value) => setValue("employment_status", value)} options={[["", "Select status"], ...(lookupsQuery.data?.employment_status ?? []).map((item) => [item.code, item.label])]} />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <WizardHeading title="Address & Location" description="Residential address, city, and zip code details." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Address" required error={showErrors ? step2Errors.address : undefined} success={Boolean(form.address?.trim())}>
                  <Input value={form.address} onChange={(event) => setValue("address", event.target.value)} placeholder="e.g. 123 Main Street, Apt 4B" />
                </Field>
              </div>
              <Field label="City" required error={showErrors ? step2Errors.city : undefined} success={Boolean(form.city?.trim())}>
                <Input value={form.city} onChange={(event) => setValue("city", event.target.value)} placeholder="e.g. San Francisco" />
              </Field>
              <Field label="Zip code" required error={showErrors ? step2Errors.zip_code : undefined} success={Boolean(form.zip_code?.trim())}>
                <Input value={form.zip_code} onChange={(event) => setValue("zip_code", event.target.value)} placeholder="e.g. 94105" />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <WizardHeading title="Emergency Contact" description="Emergency contact details." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required error={showErrors ? step3Errors.name : undefined} success={Boolean(emergencyContact.name?.trim())}>
                <Input value={emergencyContact.name} onChange={(event) => setEmergencyContactValue("name", event.target.value)} placeholder="e.g. Jane Doe" />
              </Field>
              <Field label="Relationship" required error={showErrors ? step3Errors.relationship : undefined} success={Boolean(emergencyContact.relationship?.trim())}>
                <Input value={emergencyContact.relationship} onChange={(event) => setEmergencyContactValue("relationship", event.target.value)} placeholder="e.g. Spouse, Parent, Sibling" />
              </Field>
              <Field label="Phone number" required error={showErrors ? step3Errors.phone : undefined} success={Boolean(emergencyContact.phone?.trim())}>
                <Input value={emergencyContact.phone} onChange={(event) => setEmergencyContactValue("phone", event.target.value)} placeholder="e.g. +1 234 567 8900" />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <WizardHeading title="Banking Information" description="Bank, branch, statutory details, and base salary." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bank account number" required error={showErrors ? step4Errors.bank_account_number : undefined} success={Boolean(form.bank_account_number?.trim())}>
                <Input value={form.bank_account_number} onChange={(event) => setValue("bank_account_number", event.target.value)} placeholder="e.g. 1234567890" />
              </Field>
              <Field label="IFSC code" required error={showErrors ? step4Errors.ifsc_code : undefined} success={Boolean(form.ifsc_code?.trim())}>
                <Input value={form.ifsc_code} onChange={(event) => setValue("ifsc_code", event.target.value.toUpperCase())} placeholder="e.g. HDFC0001234" />
              </Field>
              <Field label="Branch" required error={showErrors ? step4Errors.bank_branch : undefined} success={Boolean(form.bank_branch?.trim())}>
                <Input value={form.bank_branch} onChange={(event) => setValue("bank_branch", event.target.value)} placeholder="e.g. Downtown Branch" />
              </Field>
              <Field label="Base salary">
                <Input type="number" min="0" step="0.01" value={currentSalary} onChange={(event) => setCurrentSalary(event.target.value)} placeholder="e.g. 50000.00" />
              </Field>
              <Field label="PAN number" error={showErrors ? step4Errors.pan_number : undefined} required success={Boolean(form.pan_number?.trim())}>
                <Input value={form.pan_number} onChange={(event) => setValue("pan_number", event.target.value.toUpperCase())} placeholder="e.g. ABCDE1234F" />
              </Field>
              <Field label="Aadhaar number" error={showErrors ? step4Errors.aadhaar_number : undefined} required success={Boolean(form.aadhaar_number?.trim())}>
                <Input value={form.aadhaar_number} onChange={(event) => setValue("aadhaar_number", event.target.value)} placeholder="e.g. 1234 5678 9012" />
              </Field>
              <Field label="UAN number">
                <Input value={form.uan_number} onChange={(event) => setValue("uan_number", event.target.value)} placeholder="e.g. 100123456789" />
              </Field>
            </div>
            <div className="rounded-md border bg-muted/40 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold">Creation summary</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge status={`${form.first_name} ${form.last_name}`.trim()} tone="info" />
                <StatusBadge status={(form.employment_type || "FULL_TIME").replace(/_/g, " ")} tone="neutral" />
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

function Select({ value, onChange, options }: { value?: string; onChange: (value: string) => void; options: string[][] }) {
  return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map(([id, label]) => <option key={`${id}-${label}`} value={id}>{label}</option>)}</select>;
}