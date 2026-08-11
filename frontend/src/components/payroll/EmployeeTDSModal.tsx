import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawerPanel } from "@/components/ui-system/DrawerPanel";
import { createEmployeeTDSConfig } from "@/services/payroll";

interface EmployeeTDSModalProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}

function currentFinancialYearOptions(): string[] {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // April = month 3
  return [0, -1, 1].map((offset) => {
    const start = fyStartYear + offset;
    return `${start}-${String(start + 1).slice(-2)}`;
  });
}

const defaultState = {
  financial_year: "",
  monthly_tds: "",
  annual_tax_liability: "",
  tax_regime: "NEW" as "NEW" | "OLD",
  effective_from: "",
  remarks: "",
};

export function EmployeeTDSModal({ open, employeeId, employeeName, onClose }: EmployeeTDSModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(defaultState);
  const [formError, setFormError] = useState<string | null>(null);
  const fyOptions = currentFinancialYearOptions();

  useEffect(() => {
    if (open) {
      setForm({ ...defaultState, financial_year: fyOptions[1] });
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId]);

  const createMutation = useMutation({
    mutationFn: () =>
      createEmployeeTDSConfig(employeeId, {
        financial_year: form.financial_year,
        monthly_tds: Number(form.monthly_tds),
        annual_tax_liability: form.annual_tax_liability ? Number(form.annual_tax_liability) : undefined,
        tax_regime: form.tax_regime,
        effective_from: form.effective_from,
        remarks: form.remarks.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-tds-config", employeeId] });
      onClose();
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to save TDS configuration.");
    },
  });

  const submit = () => {
    if (!form.financial_year) {
      setFormError("Financial year is required.");
      return;
    }
    if (!form.monthly_tds || !Number.isFinite(Number(form.monthly_tds))) {
      setFormError("Monthly TDS must be a valid amount.");
      return;
    }
    if (!form.effective_from) {
      setFormError("Effective from date is required.");
      return;
    }
    setFormError(null);
    createMutation.mutate();
  };

  if (!open) return null;

  return (
    <DrawerPanel open={open} title={`TDS Configuration — ${employeeName}`} size="2xl" onClose={onClose}>
      <div className="space-y-5 p-1">
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Financial Year</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            value={form.financial_year}
            onChange={(event) => setForm({ ...form, financial_year: event.target.value })}
          >
            <option value="">Select financial year</option>
            {fyOptions.map((fy) => (
              <option key={fy} value={fy}>
                {fy}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Monthly TDS Amount (₹)</label>
          <Input
            value={form.monthly_tds}
            onChange={(event) => setForm({ ...form, monthly_tds: event.target.value })}
            placeholder="8125"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Annual Tax Liability (₹, optional)</label>
          <Input
            value={form.annual_tax_liability}
            onChange={(event) => setForm({ ...form, annual_tax_liability: event.target.value })}
            placeholder="97500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Tax Regime</label>
          <div className="flex gap-2">
            {(["NEW", "OLD"] as const).map((regime) => (
              <Button
                key={regime}
                type="button"
                size="sm"
                variant={form.tax_regime === regime ? "default" : "outline"}
                onClick={() => setForm({ ...form, tax_regime: regime })}
              >
                {regime === "NEW" ? "New Regime" : "Old Regime"}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Effective From</label>
          <Input
            type="date"
            value={form.effective_from}
            onChange={(event) => setForm({ ...form, effective_from: event.target.value })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Remarks</label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            value={form.remarks}
            onChange={(event) => setForm({ ...form, remarks: event.target.value })}
            placeholder="Per CA workings dated..."
          />
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save TDS Configuration"}
          </Button>
        </div>
      </div>
    </DrawerPanel>
  );
}