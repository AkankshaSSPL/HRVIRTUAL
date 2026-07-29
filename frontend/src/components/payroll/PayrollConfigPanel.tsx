import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Settings, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingSkeleton, SectionCard, ToastNotification } from "@/components/ui-system";
import {
  getPayrollConfig,
  updatePayrollConfig,
  type PayrollConfigRecord,
  type ProfessionalTaxSlab,
} from "@/services/payroll";

type ConfigForm = {
  epf_wage_cap: string;
  epf_employee_rate: string;
  epf_employer_rate: string;
  consultant_tds_rate: string;
  consultant_base_working_days: string;
  employee_base_working_days: string;
  professional_tax_slabs: ProfessionalTaxSlab[];
};

function toForm(config: PayrollConfigRecord): ConfigForm {
  return {
    epf_wage_cap: String(config.epf_wage_cap),
    epf_employee_rate: String(Number(config.epf_employee_rate) * 100),
    epf_employer_rate: String(Number(config.epf_employer_rate) * 100),
    consultant_tds_rate: String(Number(config.consultant_tds_rate) * 100),
    consultant_base_working_days: String(config.consultant_base_working_days),
    employee_base_working_days: String(config.employee_base_working_days),
    professional_tax_slabs: config.professional_tax_slabs ?? [],
  };
}

export function PayrollConfigPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const configQuery = useQuery({ queryKey: ["payroll-config"], queryFn: getPayrollConfig });

  useEffect(() => {
    if (configQuery.data && !editing) {
      setForm(toForm(configQuery.data));
    }
  }, [configQuery.data, editing]);

  const updateMutation = useMutation({
    mutationFn: updatePayrollConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-config"] });
      setEditing(false);
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to update payroll configuration.");
    },
  });

  const startEdit = () => {
    if (configQuery.data) setForm(toForm(configQuery.data));
    setFormError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    if (configQuery.data) setForm(toForm(configQuery.data));
    setFormError(null);
    setEditing(false);
  };

  const updateSlab = (index: number, key: keyof ProfessionalTaxSlab, value: string) => {
    if (!form) return;
    const slabs = form.professional_tax_slabs.map((slab, i) => {
      if (i !== index) return slab;
      if (key === "max") {
        return { ...slab, max: value.trim() === "" ? null : Number(value) };
      }
      return { ...slab, [key]: Number(value) };
    });
    setForm({ ...form, professional_tax_slabs: slabs });
  };

  const addSlab = () => {
    if (!form) return;
    setForm({
      ...form,
      professional_tax_slabs: [...form.professional_tax_slabs, { min: 0, max: null, amount: 0 }],
    });
  };

  const removeSlab = (index: number) => {
    if (!form) return;
    setForm({
      ...form,
      professional_tax_slabs: form.professional_tax_slabs.filter((_, i) => i !== index),
    });
  };

  const submit = () => {
    if (!form) return;
    const numericFields: Array<[keyof ConfigForm, string]> = [
      ["epf_wage_cap", "EPF wage cap"],
      ["epf_employee_rate", "Employee EPF rate"],
      ["epf_employer_rate", "Employer PF rate"],
      ["consultant_tds_rate", "Consultant TDS rate"],
      ["consultant_base_working_days", "Consultant base working days"],
      ["employee_base_working_days", "Employee base working days"],
    ];
    for (const [key, label] of numericFields) {
      if (!Number.isFinite(Number(form[key]))) {
        setFormError(`${label} must be a valid number.`);
        return;
      }
    }
    setFormError(null);
    updateMutation.mutate({
      epf_wage_cap: Number(form.epf_wage_cap),
      epf_employee_rate: Number(form.epf_employee_rate) / 100,
      epf_employer_rate: Number(form.epf_employer_rate) / 100,
      consultant_tds_rate: Number(form.consultant_tds_rate) / 100,
      consultant_base_working_days: Number(form.consultant_base_working_days),
      employee_base_working_days: Number(form.employee_base_working_days),
      professional_tax_slabs: form.professional_tax_slabs,
    });
  };

  if (configQuery.isLoading || !form) {
    return (
      <SectionCard>
        <LoadingSkeleton rows={5} />
      </SectionCard>
    );
  }

  if (configQuery.isError) {
    return (
      <SectionCard>
        <EmptyState title="Unable to load payroll configuration" description="Statutory rates could not be retrieved." />
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border">
            <Settings className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Payroll Configuration</h3>
            <p className="text-sm text-muted-foreground">Statutory rates used by every payroll computation.</p>
          </div>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ConfigField
          label="EPF Wage Cap (₹)"
          editing={editing}
          value={form.epf_wage_cap}
          display={`₹${Number(configQuery.data.epf_wage_cap).toLocaleString("en-IN")}`}
          onChange={(value) => setForm({ ...form, epf_wage_cap: value })}
        />
        <ConfigField
          label="Employee EPF Rate (%)"
          editing={editing}
          value={form.epf_employee_rate}
          display={`${(Number(configQuery.data.epf_employee_rate) * 100).toFixed(2)}%`}
          onChange={(value) => setForm({ ...form, epf_employee_rate: value })}
        />
        <ConfigField
          label="Employer PF Rate (%)"
          editing={editing}
          value={form.epf_employer_rate}
          display={`${(Number(configQuery.data.epf_employer_rate) * 100).toFixed(2)}%`}
          onChange={(value) => setForm({ ...form, epf_employer_rate: value })}
        />
        <ConfigField
          label="Consultant TDS Rate (%)"
          editing={editing}
          value={form.consultant_tds_rate}
          display={`${(Number(configQuery.data.consultant_tds_rate) * 100).toFixed(2)}%`}
          onChange={(value) => setForm({ ...form, consultant_tds_rate: value })}
        />
        <ConfigField
          label="Consultant Base Working Days"
          editing={editing}
          value={form.consultant_base_working_days}
          display={`${configQuery.data.consultant_base_working_days} days/month`}
          onChange={(value) => setForm({ ...form, consultant_base_working_days: value })}
        />
        <ConfigField
          label="Employee Base Working Days"
          editing={editing}
          value={form.employee_base_working_days}
          display={`${configQuery.data.employee_base_working_days} days/month`}
          onChange={(value) => setForm({ ...form, employee_base_working_days: value })}
        />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Professional Tax Slabs</label>
          {editing ? (
            <Button size="sm" variant="outline" onClick={addSlab}>
              <Plus className="h-3.5 w-3.5" />
              Add Slab
            </Button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Min (₹)</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Max (₹)</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Amount (₹)</th>
                {editing ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {form.professional_tax_slabs.map((slab, index) => (
                <tr key={index} className="border-t">
                  <td className="px-3 py-2">
                    {editing ? (
                      <Input
                        value={String(slab.min)}
                        onChange={(event) => updateSlab(index, "min", event.target.value)}
                        className="h-8 w-28"
                      />
                    ) : (
                      slab.min.toLocaleString("en-IN")
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editing ? (
                      <Input
                        value={slab.max === null ? "" : String(slab.max)}
                        placeholder="No limit"
                        onChange={(event) => updateSlab(index, "max", event.target.value)}
                        className="h-8 w-28"
                      />
                    ) : (
                      slab.max === null ? "No limit" : slab.max.toLocaleString("en-IN")
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editing ? (
                      <Input
                        value={String(slab.amount)}
                        onChange={(event) => updateSlab(index, "amount", event.target.value)}
                        className="h-8 w-28"
                      />
                    ) : (
                      slab.amount.toLocaleString("en-IN")
                    )}
                  </td>
                  {editing ? (
                    <td className="px-3 py-2">
                      <Button size="icon" variant="ghost" aria-label="Remove slab" onClick={() => removeSlab(index)}>
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formError ? <p className="mt-4 text-sm text-destructive">{formError}</p> : null}

      {editing ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={cancelEdit}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      ) : null}

      {updateMutation.isSuccess ? (
        <div className="fixed bottom-6 right-6 z-50">
          <ToastNotification title="Payroll configuration updated" description="New rates apply to future payroll runs." type="success" />
        </div>
      ) : null}
    </SectionCard>
  );
}

function ConfigField({
  label,
  editing,
  value,
  display,
  onChange,
}: {
  label: string;
  editing: boolean;
  value: string;
  display: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-muted-foreground">{label}</label>
      {editing ? (
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">{display}</div>
      )}
    </div>
  );
}