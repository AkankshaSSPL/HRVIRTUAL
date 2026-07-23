import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout, ConfirmDialog, DrawerPanel, EmptyState, LoadingSkeleton, PageContainer, PageHeader, SectionCard, StatusBadge } from "@/components/ui-system";
import { createMaster, deleteMaster, getMasters, updateMaster, type MasterRecord } from "@/services/masters";

type MasterDefinition = {
  key: string;
  title: string;
  description: string;
  group: string;
  lookupCategory?: string;
};

const groups = [
  { key: "organization", label: "Organization", icon: Building2 },
  { key: "attendance_leave", label: "Attendance & Leave", icon: Settings2 },
];

const fixedDefinitions: MasterDefinition[] = [
  { key: "departments", title: "Departments", description: "Active and inactive organization departments.", group: "organization" },
  { key: "designations", title: "Designations", description: "Job titles and organizational levels.", group: "organization" },
  { key: "leave_types", title: "Leave Types", description: "Leave policies and annual allocation.", group: "attendance_leave" },
];

const categoryGroups: Record<string, string> = {
  employment_type: "organization",
  employment_status: "organization",
  gender: "organization",
  candidate_status: "organization",
  asset_type: "organization",
  attendance_status: "attendance_leave",
  leave_category: "attendance_leave",
  leave_request_status: "attendance_leave",
};

const emptyForm: Partial<MasterRecord> = { name: "", code: "", description: "", active: true, sort_order: 0 };

export function MastersPage() {
  const queryClient = useQueryClient();
  const [group, setGroup] = useState("organization");
  const [selectedDefinition, setSelectedDefinition] = useState<MasterDefinition | null>(null);
  const [editing, setEditing] = useState<MasterRecord | null>(null);
  const [deleting, setDeleting] = useState<{ definition: MasterDefinition; record: MasterRecord } | null>(null);
  const [form, setForm] = useState<Partial<MasterRecord>>(emptyForm);
  const mastersQuery = useQuery({ queryKey: ["masters"], queryFn: getMasters });
  const workspace = mastersQuery.data;
  const definitions = useMemo(() => {
    const dynamic = Object.keys(workspace?.lookups ?? {})
      .filter((category) => Boolean(categoryGroups[category]))
      .map((category) => ({
        key: `lookup:${category}`,
        lookupCategory: category,
        title: humanize(category),
        description: `Reusable ${humanize(category).toLowerCase()} dropdown values.`,
        group: categoryGroups[category],
      }));
    return [...fixedDefinitions, ...dynamic];
  }, [workspace?.lookups]);
  const visibleDefinitions = definitions.filter((item) => item.group === group);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedDefinition) throw new Error("Master type missing");
      const masterType = selectedDefinition.lookupCategory ? "lookups" : selectedDefinition.key;
      const payload = selectedDefinition.lookupCategory ? { ...form, category: selectedDefinition.lookupCategory, label: form.name } : form;
      return editing ? updateMaster(masterType, editing.id, payload) : createMaster(masterType, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["masters"] });
      await queryClient.invalidateQueries({ queryKey: ["lookups"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-form-options"] });
      closeEditor();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleting) throw new Error("Master record missing");
      return deleteMaster(deleting.definition.lookupCategory ? "lookups" : deleting.definition.key, deleting.record.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["masters"] });
      await queryClient.invalidateQueries({ queryKey: ["lookups"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-form-options"] });
      setDeleting(null);
    },
  });

  function recordsFor(definition: MasterDefinition) {
    if (!workspace) return [];
    if (definition.lookupCategory) return workspace.lookups[definition.lookupCategory] ?? [];
    return workspace[definition.key as "departments" | "designations" | "leave_types"] ?? [];
  }

  function openEditor(definition: MasterDefinition, record?: MasterRecord) {
    setSelectedDefinition(definition);
    setEditing(record ?? null);
    setForm(record ? { ...record } : { ...emptyForm, category: definition.lookupCategory });
  }

  function closeEditor() {
    setSelectedDefinition(null);
    setEditing(null);
    setForm(emptyForm);
  }

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Masters" description="Organization structure and reusable HRMS master data." />
        <div className="flex flex-wrap gap-2 border-b pb-3">
          {groups.map(({ key, label, icon: Icon }) => (
            <Button key={key} variant={group === key ? "default" : "ghost"} onClick={() => setGroup(key)}><Icon className="h-4 w-4" />{label}</Button>
          ))}
        </div>
        {mastersQuery.isLoading ? <LoadingSkeleton rows={7} /> : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleDefinitions.map((definition) => {
            const records = recordsFor(definition);
            return (
              <SectionCard
                key={definition.key}
                title={definition.title}
                description={definition.description}
                action={<Button size="sm" onClick={() => openEditor(definition)}><Plus className="h-4 w-4" />Add</Button>}
              >
                {!records.length ? <EmptyState title={`No ${definition.title.toLowerCase()}`} description="Create the first master record for this category." /> : (
                  <div className="divide-y rounded-md border">
                    {records.map((record) => (
                      <div key={record.id} className="flex items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{record.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{record.code || record.description || record.category || "No additional details"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <StatusBadge status={record.active ? "Active" : "Inactive"} tone={record.active ? "success" : "neutral"} />
                          <Button size="icon" variant="ghost" aria-label="Edit master" onClick={() => openEditor(definition, record)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" aria-label="Delete master" onClick={() => setDeleting({ definition, record })}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
        <MasterEditor definition={selectedDefinition} editing={editing} form={form} setForm={setForm} leaveCategories={workspace?.lookups.leave_category ?? []} onClose={closeEditor} onSave={() => saveMutation.mutate()} saving={saveMutation.isPending} error={saveMutation.isError} />
        <ConfirmDialog open={Boolean(deleting)} title="Delete master record?" description={`${deleting?.record.name ?? "This record"} will stop appearing in dropdowns. Existing historical records remain unchanged.`} confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"} onCancel={() => setDeleting(null)} onConfirm={() => deleteMutation.mutate()} />
      </PageContainer>
    </AppLayout>
  );
}

function MasterEditor({ definition, editing, form, setForm, leaveCategories, onClose, onSave, saving, error }: { definition: MasterDefinition | null; editing: MasterRecord | null; form: Partial<MasterRecord>; setForm: React.Dispatch<React.SetStateAction<Partial<MasterRecord>>>; leaveCategories: MasterRecord[]; onClose: () => void; onSave: () => void; saving: boolean; error: boolean }) {
  const set = (key: keyof MasterRecord, value: string | number | boolean | null) => setForm((current) => ({ ...current, [key]: value }));
  const isLookup = Boolean(definition?.lookupCategory);
  const isLeave = definition?.key === "leave_types";
  const isDepartment = definition?.key === "departments";
  return (
    <DrawerPanel open={Boolean(definition)} title={`${editing ? "Update" : "Add"} ${isDepartment ? "Department" : definition?.title ?? "Master"}`} size="2xl" onClose={onClose}>
      <div className="space-y-4">
        <Field label={isDepartment ? "Department name" : "Name"}><Input value={form.name ?? ""} onChange={(event) => set("name", event.target.value)} /></Field>
        {!isDepartment ? <Field label="Code"><Input value={form.code ?? ""} onChange={(event) => set("code", event.target.value.toUpperCase().replace(/\s+/g, "_"))} /></Field> : null}
        {definition?.key === "designations" ? <Field label="Level"><Input value={form.level ?? ""} onChange={(event) => set("level", event.target.value)} /></Field> : null}
        {isLeave ? <><Field label="Category"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.category ?? ""} onChange={(event) => set("category", event.target.value)}><option value="">Select category</option>{leaveCategories.map((item) => <option key={item.id} value={item.code ?? ""}>{item.name}</option>)}</select></Field><Field label="Annual allocation"><Input type="number" value={form.annual_allocation ?? 0} onChange={(event) => set("annual_allocation", Number(event.target.value))} /></Field></> : null}
        {isLookup ? <Field label="Sort order"><Input type="number" value={form.sort_order ?? 0} onChange={(event) => set("sort_order", Number(event.target.value))} /></Field> : null}
        {!isLookup && !isDepartment ? <Field label="Description"><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.description ?? ""} onChange={(event) => set("description", event.target.value)} /></Field> : null}
        {isDepartment ? (
          <Field label="Status">
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={(form.active ?? true) ? "ACTIVE" : "INACTIVE"} onChange={(event) => set("active", event.target.value === "ACTIVE")}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        ) : <label className="flex items-center gap-3 rounded-md border p-3 text-sm"><input type="checkbox" checked={form.active ?? true} onChange={(event) => set("active", event.target.checked)} />Active</label>}
        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{isDepartment ? "Department could not be saved. A department with this name may already exist." : "Master record could not be saved. Check duplicate name or code values."}</p> : null}
        <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || !form.name || (!isDepartment && !form.code)} onClick={onSave}>{saving ? "Saving..." : "Save Master"}</Button></div>
      </div>
    </DrawerPanel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
