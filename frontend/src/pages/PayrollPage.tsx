import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout, ConfirmDialog, DataTable, EmptyState, LoadingSkeleton, PageContainer, PageHeader, SectionCard, StatusBadge, ToastNotification } from "@/components/ui-system";
import {
  createSalaryComponent,
  deleteSalaryComponent,
  getSalaryComponents,
  getSalaryStructures,
  updateSalaryComponent,
  type SalaryComponentRecord,
  type SalaryStructureRecord,
} from "@/services/payroll";
import { getLookups } from "@/services/lookups";

type SalaryComponentForm = {
  name: string;
  code: string;
  type: "" | "earning" | "deduction";
  calculation_type: "" | "fixed" | "percentage" | "formula" | "balance";
  calculation_value: string;
  formula: string;
  reference_component_code: string;
  taxable: boolean;
  active: boolean;
};

const defaultFormState: SalaryComponentForm = {
  name: "",
  code: "",
  type: "",
  calculation_type: "",
  calculation_value: "",
  formula: "",
  reference_component_code: "",
  taxable: true,
  active: true,
};

export function PayrollPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<SalaryComponentRecord | null>(null);
  const [deletingComponent, setDeletingComponent] = useState<SalaryComponentRecord | null>(null);
  const [formState, setFormState] = useState<SalaryComponentForm>(defaultFormState);
  const [formError, setFormError] = useState<string | null>(null);

  const componentsQuery = useQuery({ queryKey: ["payroll-components"], queryFn: getSalaryComponents });
  const components = componentsQuery.data ?? [];
  const structuresQuery = useQuery({ queryKey: ["payroll-structures"], queryFn: getSalaryStructures });
  const structures = structuresQuery.data ?? [];
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "payroll-component-form"],
    queryFn: () => getLookups(["salary_component_type", "salary_calculation_type"]),
  });

  const createMutation = useMutation({
    mutationFn: createSalaryComponent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-components"] });
      closeForm();
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to create salary component.");
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateSalaryComponent>[1] }) => updateSalaryComponent(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-components"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-structures"] });
      closeForm();
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Unable to update salary component."),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSalaryComponent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-components"] });
      setDeletingComponent(null);
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to delete salary component.");
      setDeletingComponent(null);
    },
  });

  const openCreateForm = () => {
    setEditingComponent(null);
    setFormState(defaultFormState);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (component: SalaryComponentRecord) => {
    setEditingComponent(component);
    setFormState({
      name: component.name,
      code: component.code,
      type: component.type as SalaryComponentForm["type"],
      calculation_type: component.calculation_type as SalaryComponentForm["calculation_type"],
      calculation_value: component.calculation_value?.toString() ?? "",
      formula: component.formula ?? "",
      reference_component_code: component.reference_component_code ?? "",
      taxable: component.taxable,
      active: component.active,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingComponent(null);
    setFormState(defaultFormState);
    setFormError(null);
  };

  const columns = useMemo<ColumnDef<SalaryComponentRecord>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "code", header: "Code" },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <StatusBadge status={row.original.type} tone={row.original.type === "earning" ? "success" : "warning"} />
        ),
      },
      { accessorKey: "calculation_type", header: "Calculation" },
      {
        accessorKey: "calculation_value",
        header: "Value",
        cell: ({ row }) => row.original.calculation_value ?? row.original.formula ?? "—",
      },
      {
        accessorKey: "taxable",
        header: "Taxable",
        cell: ({ row }) => (row.original.taxable ? "Yes" : "No"),
      },
      {
        accessorKey: "active",
        header: "Active",
        cell: ({ row }) => (row.original.active ? "Yes" : "No"),
      },
    ],
    [],
  );

  const structureColumns = useMemo<ColumnDef<SalaryStructureRecord>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "item_count",
        header: "Components",
        cell: ({ row }) => `${row.original.item_count ?? 0} Components`,
      },
      {
        accessorKey: "active",
        header: "Active",
        cell: ({ row }) => (row.original.active ? "Yes" : "No"),
      },
    ],
    [],
  );

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!formState.type || !formState.calculation_type) {
      setFormError("Type and calculation type are required.");
      return;
    }
    if (formState.calculation_value && !Number.isFinite(Number(formState.calculation_value))) {
      setFormError("Calculation value must be a valid number.");
      return;
    }

    const payload = {
      name: formState.name.trim(),
      code: formState.code.trim() || formState.name.trim(),
      type: formState.type,
      calculation_type: formState.calculation_type,
      calculation_value: formState.calculation_value ? Number(formState.calculation_value) : undefined,
      formula: formState.formula.trim() || undefined,
      reference_component_code: formState.reference_component_code.trim() || undefined,
      taxable: formState.taxable,
      active: formState.active,
    };

    setFormError(null);
    if (editingComponent) {
      updateMutation.mutate({ id: editingComponent.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="Payroll"
          description="Manage salary component definitions, earnings, deductions, and payroll configuration rules."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => componentsQuery.refetch()} disabled={componentsQuery.isFetching}>
                <RefreshCw className={`h-4 w-4 ${componentsQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={formOpen ? closeForm : openCreateForm}>
                <Plus className="h-4 w-4" />
                {formOpen ? "Close Form" : "New Component"}
              </Button>
            </div>
          }
        />

        {componentsQuery.isLoading ? (
          <SectionCard>
            <LoadingSkeleton rows={6} />
          </SectionCard>
        ) : null}

        {componentsQuery.isError ? (
          <SectionCard>
            <EmptyState title="Unable to load payroll components" description="The salary component catalog could not be retrieved." />
          </SectionCard>
        ) : null}

        {formOpen ? (
          <SectionCard>
            <form onSubmit={submitForm} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{editingComponent ? "Edit Salary Component" : "New Salary Component"}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{editingComponent ? "Update the component definition used by payroll calculations." : "Create an earning or deduction for salary structures."}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Name</label>
                  <Input value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} placeholder="Basic salary" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Code</label>
                  <Input value={formState.code} onChange={(event) => setFormState({ ...formState, code: event.target.value })} placeholder="BASIC" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Type</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    value={formState.type}
                    onChange={(event) => setFormState({ ...formState, type: event.target.value as SalaryComponentForm["type"] })}
                  >
                    <option value="">Select component type</option>
                    {(lookupsQuery.data?.salary_component_type ?? []).map((item) => <option key={item.id} value={item.code}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Calculation type</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    value={formState.calculation_type}
                    onChange={(event) => setFormState({ ...formState, calculation_type: event.target.value as SalaryComponentForm["calculation_type"] })}
                  >
                    <option value="">Select calculation type</option>
                    {[...(lookupsQuery.data?.salary_calculation_type ?? []), { id: "balance", code: "balance", label: "Balance" }]
                      .filter((item, index, list) => list.findIndex((entry) => entry.code === item.code) === index)
                      .map((item) => <option key={item.id} value={item.code}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Value or formula</label>
                  <Input
                    value={formState.calculation_value}
                    onChange={(event) => setFormState({ ...formState, calculation_value: event.target.value })}
                    placeholder="200 or 12"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Formula / reference</label>
                  <Input
                    value={formState.formula}
                    onChange={(event) => setFormState({ ...formState, formula: event.target.value })}
                    placeholder="40% of Basic"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Reference code</label>
                  <Input
                    value={formState.reference_component_code}
                    onChange={(event) => setFormState({ ...formState, reference_component_code: event.target.value })}
                    placeholder="BASIC"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-3">
                    <input
                      id="taxable"
                      type="checkbox"
                      checked={formState.taxable}
                      onChange={(event) => setFormState({ ...formState, taxable: event.target.checked })}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <label htmlFor="taxable" className="text-sm font-medium text-muted-foreground">
                      Taxable
                    </label>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-3">
                    <input
                      id="active"
                      type="checkbox"
                      checked={formState.active}
                      onChange={(event) => setFormState({ ...formState, active: event.target.checked })}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <label htmlFor="active" className="text-sm font-medium text-muted-foreground">
                      Active
                    </label>
                  </div>
                </div>
              </div>
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingComponent ? "Update component" : "Save component"}
                </Button>
              </div>
            </form>
          </SectionCard>
        ) : null}

        {!structuresQuery.isLoading && !structuresQuery.isError ? (
          <SectionCard>
            <h3 className="mb-4 text-lg font-semibold">Salary Structures</h3>
            <DataTable
              data={structures}
              columns={structureColumns}
              getRowId={(row) => row.id}
              searchPlaceholder="Search salary structures"
              loading={structuresQuery.isFetching}
              emptyTitle="No salary structures defined"
              emptyDescription="Create a salary structure using the Agent Command or the API."
            />
          </SectionCard>
        ) : null}

        {!componentsQuery.isLoading && !componentsQuery.isError ? (
          <SectionCard>
            <h3 className="mb-4 text-lg font-semibold">Salary Components</h3>
            <DataTable
              data={components}
              columns={columns}
              getRowId={(row) => row.id}
              searchPlaceholder="Search salary components"
              loading={componentsQuery.isFetching}
              emptyTitle="No salary components defined"
              emptyDescription="Create your first earning or deduction component to start payroll setup."
              renderRowActions={(component) => (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${component.name}`} onClick={() => openEditForm(component)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${component.name}`} onClick={() => setDeletingComponent(component)}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              )}
            />
          </SectionCard>
        ) : null}

        {formError && !formOpen ? <div className="fixed bottom-6 right-6 z-50"><ToastNotification title="Salary component action failed" description={formError} type="error" /></div> : null}
        <ConfirmDialog
          open={Boolean(deletingComponent)}
          title="Delete salary component?"
          description={`${deletingComponent?.name ?? "This component"} will be removed from the active component catalog. Components used by salary structures cannot be deleted.`}
          confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete Component"}
          onCancel={() => setDeletingComponent(null)}
          onConfirm={() => deletingComponent && deleteMutation.mutate(deletingComponent.id)}
        />
        {createMutation.isSuccess || updateMutation.isSuccess ? (
          <div className="fixed bottom-6 right-6 z-50">
            <ToastNotification title={editingComponent ? "Salary component updated" : "Salary component saved"} description="The payroll component catalog has been refreshed." type="success" />
          </div>
        ) : null}
      </PageContainer>
    </AppLayout>
  );
}
