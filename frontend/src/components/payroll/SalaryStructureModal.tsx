import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastNotification } from "@/components/ui-system";
import {
  createSalaryStructure,
  getSalaryComponents,
  type SalaryComponentRecord,
} from "@/services/payroll";
import { getLookups } from "@/services/lookups";

type StructureType = "employee" | "consultant";



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
  const [formError, setFormError] = useState<string | null>(null);

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



  const structureMutation = useMutation({
    mutationFn: createSalaryStructure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-structures"] });
    },
  });

  const isPending = structureMutation.isPending;

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



  const submit = async () => {
    if (!name.trim()) {
      setFormError("Structure name is required.");
      return;
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
      {structureMutation.isSuccess && (
        <div className="fixed bottom-6 right-6 z-50">
          <ToastNotification title="Success" description="Salary structure updated." type="success" />
        </div>
      )}
    </>
  );
}
