import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingSkeleton, SectionCard, ToastNotification } from "@/components/ui-system";
import { getCompanySettings, updateCompanySettings, type CompanySettingsRecord } from "@/services/payroll";
import toast from "react-hot-toast";

type SettingsForm = {
  company_name: string;
  company_pan: string;
  company_tan: string;
  gstin: string;
  payroll_bank_account: string;
  payroll_bank_name: string;
  payroll_bank_ifsc: string;
  address_line1: string;
  city: string;
  state: string;
};

function toForm(settings: CompanySettingsRecord | null): SettingsForm {
  return {
    company_name: settings?.company_name ?? "",
    company_pan: settings?.company_pan ?? "",
    company_tan: settings?.company_tan ?? "",
    gstin: settings?.gstin ?? "",
    payroll_bank_account: settings?.payroll_bank_account ?? "",
    payroll_bank_name: settings?.payroll_bank_name ?? "",
    payroll_bank_ifsc: settings?.payroll_bank_ifsc ?? "",
    address_line1: settings?.address_line1 ?? "",
    city: settings?.city ?? "",
    state: settings?.state ?? "",
  };
}

const FIELDS: Array<{ key: keyof SettingsForm; label: string; placeholder?: string; span?: boolean }> = [
  { key: "company_name", label: "Company Name", span: true },
  { key: "company_pan", label: "PAN" },
  { key: "company_tan", label: "TAN" },
  { key: "gstin", label: "GSTIN" },
  { key: "payroll_bank_account", label: "Bank A/C Number" },
  { key: "payroll_bank_name", label: "Bank Name" },
  { key: "payroll_bank_ifsc", label: "IFSC" },
  { key: "address_line1", label: "Address", span: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
];

export function CompanySettingsPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SettingsForm>(toForm(null));
  const [formError, setFormError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["company-settings"],
    queryFn: getCompanySettings,
    retry: false,
  });

  useEffect(() => {
    if (!editing) {
      setForm(toForm(settingsQuery.data ?? null));
      // First-time setup: no company settings row exists yet — open the form
      // directly instead of showing an empty read-only grid.
      if (settingsQuery.isSuccess && settingsQuery.data === null) {
        setEditing(true);
      }
    }
  }, [settingsQuery.data, settingsQuery.isSuccess, editing]);

  const updateMutation = useMutation({
    mutationFn: updateCompanySettings,
    onSuccess: () => {
        toast.success("Saved successfully");
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      setEditing(false);
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to update company settings.");
    },
  });

  const submit = () => {
    if (!form.company_name.trim()) {
      setFormError("Company name is required.");
      return;
    }
    setFormError(null);
    updateMutation.mutate({
      company_name: form.company_name.trim(),
      company_pan: form.company_pan.trim() || undefined,
      company_tan: form.company_tan.trim() || undefined,
      gstin: form.gstin.trim() || undefined,
      payroll_bank_account: form.payroll_bank_account.trim() || undefined,
      payroll_bank_name: form.payroll_bank_name.trim() || undefined,
      payroll_bank_ifsc: form.payroll_bank_ifsc.trim() || undefined,
      address_line1: form.address_line1.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
    });
  };

  if (settingsQuery.isLoading) {
    return (
      <SectionCard>
        <LoadingSkeleton rows={5} />
      </SectionCard>
    );
  }

  if (settingsQuery.isError) {
    return (
      <SectionCard>
        <EmptyState title="Unable to load company settings" description="Organization details could not be retrieved." />
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Company Settings</h3>
            <p className="text-sm text-muted-foreground">Used on payslips, bank sheets, and TDS exports.</p>
          </div>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className={field.span ? "sm:col-span-2" : undefined}>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">{field.label}</label>
            {editing ? (
              <Input
                value={form[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              />
            ) : (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
                {form[field.key] || "—"}
              </div>
            )}
          </div>
        ))}
      </div>

      {formError ? <p className="mt-4 text-sm text-destructive">{formError}</p> : null}

      {editing ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm(toForm(settingsQuery.data ?? null));
              setFormError(null);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Company Settings"}
          </Button>
        </div>
      ) : null}

      {updateMutation.isSuccess ? (
        <div className="fixed bottom-6 right-6 z-50">
          <ToastNotification title="Company settings updated" description="Payroll exports will use the new details." type="success" />
        </div>
      ) : null}
    </SectionCard>
  );
}