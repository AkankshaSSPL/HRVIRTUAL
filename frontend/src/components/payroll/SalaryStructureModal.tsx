import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastNotification } from "@/components/ui-system";
import {
  createSalaryStructure,
  getPayrollConfig,
  getSalaryComponents,
  updatePayrollConfig,
  type ProfessionalTaxSlab,
  type SalaryComponentRecord,
} from "@/services/payroll";
import { getLookups } from "@/services/lookups";

type StructureType = "employee" | "consultant";

type ConfigForm = {
  epf_wage_cap: string;
  epf_employee_rate: string;
  epf_employer_rate: string;
  consultant_tds_rate: string;
  consultant_base_working_days: string;
  employee_base_working_days: string;
  professional_tax_slabs: ProfessionalTaxSlab[];
};

type StructureItemForm = {
  component_code: string;
  calculation_type: string;
  calculation_value: string;
  formula: string;
  reference_component_code: string;
};

type SalaryStructureModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SalaryStructureModal({ open, onOpenChange }: SalaryStructureModalProps) {
  const queryClient = useQueryClient();

  const [structureType, setStructureType] = useState<StructureType>("employee");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<StructureItemForm[]>([]);
  const [configForm, setConfigForm] = useState<ConfigForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const configQuery = useQuery({ queryKey: ["payroll-config"], queryFn: getPayrollConfig, enabled: open });
  const componentsQuery = useQuery({ queryKey: ["payroll-components"], queryFn: getSalaryComponents, enabled: open });
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "salary_calculation_type"],
    queryFn: () => getLookups(["salary_calculation_type"]),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setItems([]);
      setStructureType("employee");
      setFormError(null);
    }
  }, [open]);

  useEffect(() => {
    if (configQuery.data && open) {
      setConfigForm({
        epf_wage_cap: String(configQuery.data.epf_wage_cap),
        epf_employee_rate: String(Number(configQuery.data.epf_employee_rate) * 100),
        epf_employer_rate: String(Number(configQuery.data.epf_employer_rate) * 100),
        consultant_tds_rate: String(Number(configQuery.data.consultant_tds_rate) * 100),
        consultant_base_working_days: String(configQuery.data.consultant_base_working_days),
        employee_base_working_days: String(configQuery.data.employee_base_working_days),
        professional_tax_slabs: configQuery.data.professional_tax_slabs ?? [],
      });
    }
  }, [configQuery.data, open]);

  const structureMutation = useMutation({
    mutationFn: createSalaryStructure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-structures"] });
    },
  });

  const configMutation = useMutation({
    mutationFn: updatePayrollConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-config"] });
    },
  });

  const isPending = structureMutation.isPending || configMutation.isPending;

  const handleAddItem = () => {
    setItems([...items, { component_code: "", calculation_type: "", calculation_value: "", formula: "", reference_component_code: "" }]);
  };

  const handleUpdateItem = (index: number, field: keyof StructureItemForm, value: string) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    
    // Auto-fill defaults if component code changes
    if (field === "component_code") {
      const comp = componentsQuery.data?.find((c) => c.code === value);
      if (comp) {
        next[index].calculation_type = comp.calculation_type || "";
        next[index].calculation_value = comp.calculation_value ? String(comp.calculation_value) : "";
        next[index].formula = comp.formula || "";
        next[index].reference_component_code = comp.reference_component_code || "";
      }
    }
    
    setItems(next);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateSlab = (index: number, key: keyof ProfessionalTaxSlab, value: string) => {
    if (!configForm) return;
    const slabs = configForm.professional_tax_slabs.map((slab, i) => {
      if (i !== index) return slab;
      if (key === "max") {
        return { ...slab, max: value.trim() === "" ? null : Number(value) };
      }
      return { ...slab, [key]: Number(value) };
    });
    setConfigForm({ ...configForm, professional_tax_slabs: slabs });
  };

  const addSlab = () => {
    if (!configForm) return;
    setConfigForm({
      ...configForm,
      professional_tax_slabs: [...configForm.professional_tax_slabs, { min: 0, max: null, amount: 0 }],
    });
  };

  const removeSlab = (index: number) => {
    if (!configForm) return;
    setConfigForm({
      ...configForm,
      professional_tax_slabs: configForm.professional_tax_slabs.filter((_, i) => i !== index),
    });
  };

  const submit = async () => {
    if (!name.trim()) {
      setFormError("Structure name is required.");
      return;
    }
    if (!configForm) {
      setFormError("Configuration data not loaded yet.");
      return;
    }
    
    const numericFields: Array<[keyof ConfigForm, string]> = [
      ["epf_wage_cap", "EPF wage cap"],
      ["epf_employee_rate", "Employee EPF rate"],
      ["epf_employer_rate", "Employer PF rate"],
      ["consultant_tds_rate", "Consultant TDS rate"],
      ["consultant_base_working_days", "Consultant base working days"],
      ["employee_base_working_days", "Employee base working days"],
    ];
    for (const [key, label] of numericFields) {
      if (!Number.isFinite(Number(configForm[key]))) {
        setFormError(`${label} must be a valid number.`);
        return;
      }
    }
    
    if (structureType === "employee") {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.component_code) {
          setFormError(`Component selection is required for item ${i + 1}.`);
          return;
        }
        if (!item.calculation_type) {
          setFormError(`Calculation type is required for item ${i + 1}.`);
          return;
        }
        if (item.calculation_value && !Number.isFinite(Number(item.calculation_value))) {
          setFormError(`Calculation value must be a valid number for item ${i + 1}.`);
          return;
        }
      }
    }

    setFormError(null);
    
    try {
      await configMutation.mutateAsync({
        epf_wage_cap: Number(configForm.epf_wage_cap),
        epf_employee_rate: Number(configForm.epf_employee_rate) / 100,
        epf_employer_rate: Number(configForm.epf_employer_rate) / 100,
        consultant_tds_rate: Number(configForm.consultant_tds_rate) / 100,
        consultant_base_working_days: Number(configForm.consultant_base_working_days),
        employee_base_working_days: Number(configForm.employee_base_working_days),
        professional_tax_slabs: configForm.professional_tax_slabs,
      });

      const finalDescription = `[${structureType === 'employee' ? 'Employee' : 'Consultant'}] ${description}`.trim();
      
      const payloadItems = structureType === "employee" ? items.map(item => ({
        component_code: item.component_code,
        calculation_type: item.calculation_type,
        calculation_value: item.calculation_value ? Number(item.calculation_value) : undefined,
        formula: item.formula.trim() || undefined,
        reference_component_code: item.reference_component_code.trim() || undefined,
      })) : [];

      await structureMutation.mutateAsync({
        name: name.trim(),
        description: finalDescription,
        items: payloadItems,
      });

      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save.");
    }
  };

  const renderConfigField = (label: string, key: keyof ConfigForm, placeholder?: string) => {
    if (!configForm) return null;
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-muted-foreground">{label}</label>
        <Input 
          value={configForm[key] as string} 
          onChange={(e) => setConfigForm({ ...configForm, [key]: e.target.value })} 
          placeholder={placeholder}
        />
      </div>
    );
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
        <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-soft flex flex-col">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">New Salary Structure</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create a new salary structure and adjust relevant payroll configurations.</p>
          </div>

          <div className="space-y-6 py-4 flex-1">
            {/* Toggle Structure Type */}
            <div className="flex p-1 space-x-1 bg-muted/50 rounded-lg w-full max-w-sm mx-auto">
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  structureType === "employee" ? "bg-white text-foreground shadow-sm ring-1 ring-slate-200" : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setStructureType("employee")}
              >
                Employee
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  structureType === "consultant" ? "bg-white text-foreground shadow-sm ring-1 ring-slate-200" : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setStructureType("consultant")}
              >
                Consultant
              </button>
            </div>

            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Structure Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Tech Team" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4 text-foreground/90">Global Payroll Configuration</h3>
              {configQuery.isLoading ? (
                <div className="animate-pulse flex space-x-4">
                  <div className="flex-1 space-y-4 py-1">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded"></div>
                      <div className="h-4 bg-muted rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
              ) : structureType === "employee" ? (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {renderConfigField("EPF Wage Cap (₹)", "epf_wage_cap")}
                    {renderConfigField("Employee EPF Rate (%)", "epf_employee_rate")}
                    {renderConfigField("Employer PF Rate (%)", "epf_employer_rate")}
                    {renderConfigField("Employee Base Working Days", "employee_base_working_days")}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-muted-foreground">Professional Tax Slabs</label>
                      <Button type="button" size="sm" variant="outline" onClick={addSlab}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Slab
                      </Button>
                    </div>
                    {configForm && (
                      <div className="overflow-hidden rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Min (₹)</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Max (₹)</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Amount (₹)</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {configForm.professional_tax_slabs.map((slab, index) => (
                              <tr key={index} className="border-t">
                                <td className="px-3 py-2">
                                  <Input value={String(slab.min)} onChange={(e) => updateSlab(index, "min", e.target.value)} className="h-8 w-28" />
                                </td>
                                <td className="px-3 py-2">
                                  <Input value={slab.max === null ? "" : String(slab.max)} placeholder="No limit" onChange={(e) => updateSlab(index, "max", e.target.value)} className="h-8 w-28" />
                                </td>
                                <td className="px-3 py-2">
                                  <Input value={String(slab.amount)} onChange={(e) => updateSlab(index, "amount", e.target.value)} className="h-8 w-28" />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button type="button" size="icon" variant="ghost" onClick={() => removeSlab(index)}>
                                    <Trash2 className="h-4 w-4 text-rose-600" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderConfigField("Consultant TDS Rate (%)", "consultant_tds_rate")}
                  {renderConfigField("Consultant Base Working Days", "consultant_base_working_days")}
                </div>
              )}
            </div>

            {structureType === "employee" && (
              <div className="border-t pt-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground/90">Salary Components</h3>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Component
                  </Button>
                </div>
                
                {items.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20 border-dashed">
                    No components added yet. Click 'Add Component' to start building this structure.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <div key={index} className="flex flex-col gap-3 p-4 border rounded-lg bg-card shadow-sm relative group">
                        <Button 
                          type="button" 
                          size="icon" 
                          variant="ghost" 
                          className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <X className="h-4 w-4 text-muted-foreground hover:text-rose-600" />
                        </Button>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pr-6">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Component</label>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                              value={item.component_code}
                              onChange={(e) => handleUpdateItem(index, "component_code", e.target.value)}
                            >
                              <option value="">Select...</option>
                              {(componentsQuery.data ?? []).map(c => (
                                <option key={c.code} value={c.code}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Calculation Type</label>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                              value={item.calculation_type}
                              onChange={(e) => handleUpdateItem(index, "calculation_type", e.target.value)}
                            >
                              <option value="">Select...</option>
                              {[...(lookupsQuery.data?.salary_calculation_type ?? []), { id: "balance", code: "balance", label: "Balance" }]
                                .filter((type, i, list) => list.findIndex((entry) => entry.code === type.code) === i)
                                .map(t => <option key={t.id} value={t.code}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Value/Formula</label>
                            <Input 
                              className="h-9"
                              value={item.calculation_type === 'formula' ? item.formula : item.calculation_value} 
                              onChange={(e) => {
                                if (item.calculation_type === 'formula') {
                                  handleUpdateItem(index, "formula", e.target.value);
                                } else {
                                  handleUpdateItem(index, "calculation_value", e.target.value);
                                }
                              }} 
                              placeholder={item.calculation_type === 'formula' ? "e.g. 40% of BASIC" : "e.g. 200"}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ref Component</label>
                            <Input 
                              className="h-9"
                              value={item.reference_component_code} 
                              onChange={(e) => handleUpdateItem(index, "reference_component_code", e.target.value)} 
                              placeholder="e.g. BASIC"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {formError && (
            <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Saving..." : "Save Structure"}
            </Button>
          </div>
        </div>
      </div>
      {structureMutation.isSuccess && configMutation.isSuccess && (
        <div className="fixed bottom-6 right-6 z-50">
          <ToastNotification title="Success" description="Salary structure and payroll configuration updated." type="success" />
        </div>
      )}
    </>
  );
}
