import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Settings2, ChevronDown, ChevronUp, GripVertical, ArrowUp, ArrowDown, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard, ToastNotification, ConfirmDialog, DrawerPanel } from "@/components/ui-system";
import {
  getPayTypes,
  createPayType,
  updatePayType,
  deletePayType,
  setPayTypeRules,
  getPayrollConfig,
  updatePayrollConfig,
  getSalaryStructures,
  createSalaryAssignment,
  type PayTypeRecord,
  type PayTypeRuleRecord,
  type PayrollConfigRecord,
  type PayrollConfigUpdatePayload,
  type ProfessionalTaxSlab,
  type SalaryStructureRecord,
} from "@/services/payroll";
import { getEmployees, type EmployeeRecord } from "@/services/employees";

// ── Constants ────────────────────────────────────────────────────────────────
const CALC_TYPE_LABELS: Record<string, string> = {
  FIXED: "Fixed Amount",
  PERCENT_OF: "Percentage Of",
  FORMULA: "Formula",
  STATUTORY_EPF: "Statutory EPF",
  STATUTORY_PT: "Professional Tax",
  STATUTORY_TDS: "Employee TDS",
  FLAT_TDS: "Flat TDS Rate",
  LEAVE_DEDUCTION: "Leave Deduction",
};
const CALC_TYPE_OPTIONS = Object.entries(CALC_TYPE_LABELS);

const KIND_LABELS: Record<string, string> = {
  EARNING: "Earning",
  DEDUCTION: "Deduction",
  EMPLOYER_CONTRIBUTION: "Employer Contribution",
};
const KIND_OPTIONS = Object.entries(KIND_LABELS);

const PAY_BASIS_OPTIONS: [string, string][] = [
  ["STRUCTURE", "Salary Structure"],
  ["FLAT_FEE", "Flat Fee"],
];

const PRORATION_OPTIONS: [string, string][] = [
  ["CALENDAR_WORKING_DAYS", "Calendar Working Days"],
  ["FIXED_BASE_DAYS", "Fixed Base Days"],
];

const emptyRule = (): Omit<PayTypeRuleRecord, "id" | "pay_type_id"> => ({
  sequence: 1,
  code: "",
  label: "",
  kind: "EARNING",
  calc_type: "FIXED",
  value: null,
  reference_code: null,
  formula: null,
  taxable: true,
  prorate: false,
});

const inputClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const selectClass = `${inputClass} appearance-none`;

// ── Rule Row (editable) ──────────────────────────────────────────────────────
function EditableRuleRow({
  rule,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  rule: Omit<PayTypeRuleRecord, "id" | "pay_type_id">;
  index: number;
  total: number;
  onChange: (updated: Omit<PayTypeRuleRecord, "id" | "pay_type_id">) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-mono text-muted-foreground w-5 text-center">{index + 1}</span>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input
            placeholder="Code (e.g. BASIC)"
            value={rule.code}
            onChange={(e) => onChange({ ...rule, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
            className="h-8 text-xs font-mono"
          />
          <Input
            placeholder="Label"
            value={rule.label}
            onChange={(e) => onChange({ ...rule, label: e.target.value })}
            className="h-8 text-xs"
          />
          <select
            className={`${selectClass} h-8 text-xs`}
            value={rule.kind}
            onChange={(e) => onChange({ ...rule, kind: e.target.value })}
          >
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            className={`${selectClass} h-8 text-xs`}
            value={rule.calc_type}
            onChange={(e) => onChange({ ...rule, calc_type: e.target.value })}
          >
            {CALC_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-11">
        {(rule.calc_type === "FIXED" || rule.calc_type === "PERCENT_OF" || rule.calc_type === "FLAT_TDS") ? (
          <div className="w-28">
            <Input
              type="number"
              step="any"
              placeholder={rule.calc_type === "FIXED" ? "Amount" : "Rate %"}
              value={rule.value ?? ""}
              onChange={(e) => onChange({ ...rule, value: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-8 text-xs"
            />
          </div>
        ) : null}
        {rule.calc_type === "PERCENT_OF" ? (
          <div className="w-32">
            <Input
              placeholder="Reference code"
              value={rule.reference_code ?? ""}
              onChange={(e) => onChange({ ...rule, reference_code: e.target.value.toUpperCase() || null })}
              className="h-8 text-xs font-mono"
            />
          </div>
        ) : null}
        {rule.calc_type === "FORMULA" ? (
          <div className="flex-1">
            <Input
              placeholder="Formula expression"
              value={rule.formula ?? ""}
              onChange={(e) => onChange({ ...rule, formula: e.target.value || null })}
              className="h-8 text-xs font-mono"
            />
          </div>
        ) : null}
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={rule.taxable} onChange={(e) => onChange({ ...rule, taxable: e.target.checked })} className="rounded" />
          Taxable
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={rule.prorate} onChange={(e) => onChange({ ...rule, prorate: e.target.checked })} className="rounded" />
          Prorate
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={onMoveUp} aria-label="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={index === total - 1} onClick={onMoveDown} aria-label="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={onDelete} aria-label="Remove rule">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Read-only Rule Row ───────────────────────────────────────────────────────
function RuleRow({ rule, index }: { rule: PayTypeRuleRecord; index: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <span className="w-6 text-center text-muted-foreground font-mono text-xs">{index + 1}</span>
      <span className="min-w-24 font-medium">{rule.code}</span>
      <span className="text-muted-foreground">{rule.label}</span>
      <span className="ml-auto flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rule.kind === "EARNING" ? "bg-emerald-100 text-emerald-700" : rule.kind === "DEDUCTION" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}`}>
          {KIND_LABELS[rule.kind] ?? rule.kind}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {CALC_TYPE_LABELS[rule.calc_type] ?? rule.calc_type}
        </span>
        {rule.value != null ? <span className="text-xs text-muted-foreground">{rule.calc_type === "PERCENT_OF" || rule.calc_type === "FLAT_TDS" ? `${rule.value}%` : `₹${rule.value}`}</span> : null}
        {rule.prorate ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">Prorated</span> : null}
      </span>
    </div>
  );
}

// ── Pay Type Card ────────────────────────────────────────────────────────────
function PayTypeCard({
  payType,
  onEdit,
  onEditRules,
  onDelete,
}: {
  payType: PayTypeRecord;
  onEdit: () => void;
  onEditRules: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card transition-shadow hover:shadow-md">
      <div className="flex w-full items-center gap-3 px-5 py-4">
        <button
          type="button"
          className="flex flex-1 items-center gap-3 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">{payType.name}</h4>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">{payType.code}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${payType.pay_basis === "STRUCTURE" ? "bg-indigo-100 text-indigo-700" : "bg-teal-100 text-teal-700"}`}>
                {payType.pay_basis === "STRUCTURE" ? "Salary Structure" : "Flat Fee"}
              </span>
              {!payType.active ? <span className="rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-500">Inactive</span> : null}
            </div>
            {payType.description ? <p className="mt-1 text-sm text-muted-foreground">{payType.description}</p> : null}
          </div>
          <span className="text-xs text-muted-foreground">{payType.rules.length} rule{payType.rules.length !== 1 ? "s" : ""}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-1 border-l pl-3">
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label={`Edit ${payType.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onEditRules} aria-label={`Edit rules for ${payType.name}`}>
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label={`Delete ${payType.name}`}>
            <Trash2 className="h-4 w-4 text-rose-600" />
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="border-t px-5 py-4 space-y-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span>Proration: <strong>{payType.proration_basis === "FIXED_BASE_DAYS" ? `Fixed (${payType.base_working_days ?? 22} days)` : "Calendar Working Days"}</strong></span>
          </div>
          {payType.rules.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No rules configured — using engine defaults.</p>
          ) : (
            payType.rules.map((rule, idx) => <RuleRow key={rule.id} rule={rule} index={idx} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Pay Type Create/Edit Drawer ──────────────────────────────────────────────
function PayTypeDrawer({
  open,
  payType,
  onClose,
  onSaved,
}: {
  open: boolean;
  payType: PayTypeRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    pay_basis: "STRUCTURE",
    proration_basis: "CALENDAR_WORKING_DAYS",
    base_working_days: 22,
    description: "",
    active: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (payType) {
        setForm({
          code: payType.code,
          name: payType.name,
          pay_basis: payType.pay_basis,
          proration_basis: payType.proration_basis,
          base_working_days: payType.base_working_days ?? 22,
          description: payType.description ?? "",
          active: payType.active,
        });
      } else {
        setForm({ code: "", name: "", pay_basis: "STRUCTURE", proration_basis: "CALENDAR_WORKING_DAYS", base_working_days: 22, description: "", active: true });
      }
      setError(null);
    }
  }, [open, payType]);

  const createMut = useMutation({
    mutationFn: createPayType,
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create pay type."),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updatePayType>[1] }) => updatePayType(id, payload),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to update pay type."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and name are required.");
      return;
    }
    setError(null);
    if (payType) {
      updateMut.mutate({
        id: payType.id,
        payload: {
          name: form.name.trim(),
          pay_basis: form.pay_basis,
          proration_basis: form.proration_basis,
          base_working_days: form.proration_basis === "FIXED_BASE_DAYS" ? form.base_working_days : null,
          description: form.description.trim() || null,
          active: form.active,
        },
      });
    } else {
      createMut.mutate({
        code: form.code.trim().toUpperCase().replace(/\s+/g, "_"),
        name: form.name.trim(),
        pay_basis: form.pay_basis,
        proration_basis: form.proration_basis,
        base_working_days: form.proration_basis === "FIXED_BASE_DAYS" ? form.base_working_days : null,
        description: form.description.trim() || null,
      });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <DrawerPanel open={open} title={payType ? "Edit Pay Type" : "Create Pay Type"} size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Code</label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={Boolean(payType)}
              placeholder="e.g. INTERN"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Intern" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Pay Basis</label>
            <select className={selectClass} value={form.pay_basis} onChange={(e) => setForm({ ...form, pay_basis: e.target.value })}>
              {PAY_BASIS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Proration Basis</label>
            <select className={selectClass} value={form.proration_basis} onChange={(e) => setForm({ ...form, proration_basis: e.target.value })}>
              {PRORATION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {form.proration_basis === "FIXED_BASE_DAYS" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Base Working Days</label>
              <Input type="number" value={form.base_working_days} onChange={(e) => setForm({ ...form, base_working_days: Number(e.target.value) })} />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
          </div>
          {payType ? (
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
                Active
              </label>
            </div>
          ) : null}
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : payType ? "Update Pay Type" : "Create Pay Type"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </DrawerPanel>
  );
}

// ── Rule Builder Drawer ──────────────────────────────────────────────────────
function RuleBuilderDrawer({
  open,
  payType,
  onClose,
  onSaved,
}: {
  open: boolean;
  payType: PayTypeRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  type DraftRule = Omit<PayTypeRuleRecord, "id" | "pay_type_id">;
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && payType) {
      setRules(
        payType.rules.map((r) => ({
          sequence: r.sequence,
          code: r.code,
          label: r.label,
          kind: r.kind,
          calc_type: r.calc_type,
          value: r.value,
          reference_code: r.reference_code,
          formula: r.formula,
          taxable: r.taxable,
          prorate: r.prorate,
        }))
      );
      setError(null);
    }
  }, [open, payType]);

  const saveMut = useMutation({
    mutationFn: (payload: { id: string; rules: DraftRule[] }) =>
      setPayTypeRules(
        payload.id,
        payload.rules.map((r, i) => ({ ...r, sequence: i + 1 }))
      ),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to save rules."),
  });

  const addRule = () => setRules([...rules, { ...emptyRule(), sequence: rules.length + 1 }]);

  const updateRule = (idx: number, updated: DraftRule) => {
    const next = [...rules];
    next[idx] = updated;
    setRules(next);
  };

  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...rules];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setRules(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= rules.length - 1) return;
    const next = [...rules];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setRules(next);
  };

  const handleSave = () => {
    for (const r of rules) {
      if (!r.code.trim()) {
        setError("Every rule must have a code.");
        return;
      }
    }
    setError(null);
    if (payType) {
      saveMut.mutate({ id: payType.id, rules });
    }
  };

  if (!payType) return null;

  return (
    <DrawerPanel open={open} title={`Rules — ${payType.name}`} size="2xl" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Configure the payroll rules for <strong>{payType.name}</strong>. Rules are evaluated in order from top to bottom.
        </p>
        {rules.map((rule, idx) => (
          <EditableRuleRow
            key={idx}
            rule={rule}
            index={idx}
            total={rules.length}
            onChange={(updated) => updateRule(idx, updated)}
            onDelete={() => removeRule(idx)}
            onMoveUp={() => moveUp(idx)}
            onMoveDown={() => moveDown(idx)}
          />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule
        </Button>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="flex gap-2 pt-2 border-t">
          <Button onClick={handleSave} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save Rules"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </DrawerPanel>
  );
}

// ── Salary Assignment Drawer ─────────────────────────────────────────────────
function SalaryAssignmentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ employee_id: "", salary_structure_id: "", gross_salary: "", effective_from: new Date().toISOString().slice(0, 10), reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees, enabled: open });
  const structuresQuery = useQuery({ queryKey: ["payroll-structures"], queryFn: getSalaryStructures, enabled: open });

  const employees = employeesQuery.data?.items ?? [];
  const structures = structuresQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setForm({ employee_id: "", salary_structure_id: "", gross_salary: "", effective_from: new Date().toISOString().slice(0, 10), reason: "" });
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: createSalaryAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to assign salary."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_id || !form.salary_structure_id || !form.gross_salary) {
      setError("Employee, structure, and gross salary are required.");
      return;
    }
    setError(null);
    mutation.mutate({
      employee_id: form.employee_id,
      salary_structure_id: form.salary_structure_id,
      gross_salary: Number(form.gross_salary),
      effective_from: form.effective_from,
      reason: form.reason || undefined,
    });
  };

  return (
    <DrawerPanel open={open} title="Assign Salary Structure" size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Employee</label>
          <select className={selectClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Select employee</option>
            {employees.map((emp: EmployeeRecord) => (
              <option key={emp.id} value={emp.id}>
                {emp.name || `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || "Unknown"} ({emp.employee_code ?? emp.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Salary Structure</label>
          <select className={selectClass} value={form.salary_structure_id} onChange={(e) => setForm({ ...form, salary_structure_id: e.target.value })}>
            <option value="">Select structure</option>
            {structures.map((s: SalaryStructureRecord) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Gross Salary (₹)</label>
            <Input type="number" step="any" value={form.gross_salary} onChange={(e) => setForm({ ...form, gross_salary: e.target.value })} placeholder="e.g. 50000" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Effective From</label>
            <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Reason (optional)</label>
          <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Annual increment" />
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">Salary assigned successfully!</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Assigning…" : "Assign Salary"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </DrawerPanel>
  );
}

// ── Statutory Config Section ─────────────────────────────────────────────────
function StatutoryConfigSection() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ["payroll-config"], queryFn: getPayrollConfig });
  const config = configQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PayrollConfigUpdatePayload | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: PayrollConfigUpdatePayload) => updatePayrollConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-config"] });
      setEditing(false);
      setToast("Payroll configuration updated successfully.");
      setTimeout(() => setToast(null), 3000);
    },
  });

  const startEdit = () => {
    if (!config) return;
    setForm({
      epf_wage_cap: config.epf_wage_cap,
      epf_employee_rate: config.epf_employee_rate,
      epf_employer_rate: config.epf_employer_rate,
      consultant_tds_rate: config.consultant_tds_rate,
      consultant_base_working_days: config.consultant_base_working_days,
      employee_base_working_days: config.employee_base_working_days,
      professional_tax_slabs: config.professional_tax_slabs ?? [],
    });
    setEditing(true);
  };

  const addSlab = () => {
    if (!form) return;
    const slabs = [...(form.professional_tax_slabs ?? [])];
    const lastMax = slabs.length > 0 ? (slabs[slabs.length - 1].max ?? 0) : 0;
    slabs.push({ min: lastMax + 1, max: null, amount: 0 });
    setForm({ ...form, professional_tax_slabs: slabs });
  };

  const updateSlab = (index: number, field: keyof ProfessionalTaxSlab, value: number | null) => {
    if (!form) return;
    const slabs = [...(form.professional_tax_slabs ?? [])];
    slabs[index] = { ...slabs[index], [field]: value };
    setForm({ ...form, professional_tax_slabs: slabs });
  };

  const removeSlab = (index: number) => {
    if (!form) return;
    const slabs = (form.professional_tax_slabs ?? []).filter((_, i) => i !== index);
    setForm({ ...form, professional_tax_slabs: slabs });
  };

  if (configQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading configuration…</p>;
  if (!config) return <p className="text-sm text-muted-foreground">No payroll configuration found.</p>;

  return (
    <div className="space-y-4">
      {!editing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Statutory Configuration</h4>
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ConfigItem label="EPF Wage Cap" value={`₹${config.epf_wage_cap.toLocaleString()}`} />
            <ConfigItem label="Employee EPF Rate" value={`${(config.epf_employee_rate * 100).toFixed(1)}%`} />
            <ConfigItem label="Employer EPF Rate" value={`${(config.epf_employer_rate * 100).toFixed(1)}%`} />
            <ConfigItem label="Consultant TDS Rate" value={`${(config.consultant_tds_rate * 100).toFixed(1)}%`} />
            <ConfigItem label="Employee Base Working Days" value={`${config.employee_base_working_days}`} />
            <ConfigItem label="Consultant Base Working Days" value={`${config.consultant_base_working_days}`} />
          </div>
          {config.professional_tax_slabs && config.professional_tax_slabs.length > 0 ? (
            <div>
              <h5 className="mb-2 text-sm font-medium text-muted-foreground">Professional Tax Slabs</h5>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Min (₹)</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Max (₹)</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tax (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.professional_tax_slabs.map((slab, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{slab.min.toLocaleString()}</td>
                        <td className="px-3 py-2">{slab.max != null ? slab.max.toLocaleString() : "∞"}</td>
                        <td className="px-3 py-2 font-medium">₹{slab.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : form ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (form) saveMutation.mutate(form);
          }}
        >
          <h4 className="font-semibold">Edit Statutory Configuration</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">EPF Wage Cap (₹)</label>
              <input className={inputClass} type="number" value={form.epf_wage_cap} onChange={(e) => setForm({ ...form, epf_wage_cap: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Employee EPF Rate</label>
              <input className={inputClass} type="number" step="0.001" value={form.epf_employee_rate} onChange={(e) => setForm({ ...form, epf_employee_rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Employer EPF Rate</label>
              <input className={inputClass} type="number" step="0.001" value={form.epf_employer_rate} onChange={(e) => setForm({ ...form, epf_employer_rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Consultant TDS Rate</label>
              <input className={inputClass} type="number" step="0.001" value={form.consultant_tds_rate} onChange={(e) => setForm({ ...form, consultant_tds_rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Employee Base Working Days</label>
              <input className={inputClass} type="number" value={form.employee_base_working_days} onChange={(e) => setForm({ ...form, employee_base_working_days: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Consultant Base Working Days</label>
              <input className={inputClass} type="number" value={form.consultant_base_working_days} onChange={(e) => setForm({ ...form, consultant_base_working_days: Number(e.target.value) })} />
            </div>
          </div>

          {/* PT Slab Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-muted-foreground">Professional Tax Slabs</h5>
              <Button type="button" size="sm" variant="outline" onClick={addSlab}>
                <Plus className="h-3 w-3 mr-1" /> Add Slab
              </Button>
            </div>
            {(form.professional_tax_slabs ?? []).length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Min (₹)</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Max (₹)</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tax (₹)</th>
                      <th className="px-3 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.professional_tax_slabs ?? []).map((slab, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">
                          <input className={`${inputClass} h-8 text-xs`} type="number" value={slab.min} onChange={(e) => updateSlab(i, "min", Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1">
                          <input className={`${inputClass} h-8 text-xs`} type="number" placeholder="∞" value={slab.max ?? ""} onChange={(e) => updateSlab(i, "max", e.target.value === "" ? null : Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1">
                          <input className={`${inputClass} h-8 text-xs`} type="number" value={slab.amount} onChange={(e) => updateSlab(i, "amount", Number(e.target.value))} />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeSlab(i)} aria-label="Remove slab">
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No PT slabs configured. Click "Add Slab" to add one.</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Configuration"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {toast ? <div className="fixed bottom-6 right-6 z-50"><ToastNotification title="Configuration saved" description={toast} type="success" /></div> : null}
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

// ── Main Settings Tab Component ──────────────────────────────────────────────
export function PayrollSettingsTab() {
  const queryClient = useQueryClient();
  const payTypesQuery = useQuery({ queryKey: ["pay-types"], queryFn: () => getPayTypes(false) });
  const payTypes = payTypesQuery.data ?? [];

  // Pay Type drawers
  const [payTypeDrawerOpen, setPayTypeDrawerOpen] = useState(false);
  const [editingPayType, setEditingPayType] = useState<PayTypeRecord | null>(null);
  const [ruleBuilderOpen, setRuleBuilderOpen] = useState(false);
  const [rulePayType, setRulePayType] = useState<PayTypeRecord | null>(null);
  const [deletingPayType, setDeletingPayType] = useState<PayTypeRecord | null>(null);
  const [assignDrawerOpen, setAssignDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: deletePayType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-types"] });
      setDeletingPayType(null);
      setToast("Pay type deleted.");
      setTimeout(() => setToast(null), 3000);
    },
  });

  const openCreate = () => { setEditingPayType(null); setPayTypeDrawerOpen(true); };
  const openEdit = (pt: PayTypeRecord) => { setEditingPayType(pt); setPayTypeDrawerOpen(true); };
  const openRuleBuilder = (pt: PayTypeRecord) => { setRulePayType(pt); setRuleBuilderOpen(true); };
  const onPayTypeSaved = () => { queryClient.invalidateQueries({ queryKey: ["pay-types"] }); };

  return (
    <div className="space-y-6">
      {/* Pay Types */}
      <SectionCard>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Pay Types</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => payTypesQuery.refetch()} disabled={payTypesQuery.isFetching}>
              Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Pay Type
            </Button>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Each pay type defines the payroll rules for a worker category. Rules are evaluated in sequence to compute earnings, deductions, and statutory contributions.
        </p>
        {payTypesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading pay types…</p>
        ) : payTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No pay types configured.</p>
        ) : (
          <div className="space-y-3">
            {payTypes.map((pt) => (
              <PayTypeCard
                key={pt.id}
                payType={pt}
                onEdit={() => openEdit(pt)}
                onEditRules={() => openRuleBuilder(pt)}
                onDelete={() => setDeletingPayType(pt)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Statutory Config */}
      <SectionCard>
        <StatutoryConfigSection />
      </SectionCard>

      {/* Salary Assignment */}
      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">Salary Assignments</h4>
            <p className="mt-1 text-sm text-muted-foreground">Assign a salary structure and gross salary to an employee.</p>
          </div>
          <Button size="sm" onClick={() => setAssignDrawerOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Assign Salary
          </Button>
        </div>
      </SectionCard>

      {/* Drawers & Dialogs */}
      <PayTypeDrawer
        open={payTypeDrawerOpen}
        payType={editingPayType}
        onClose={() => setPayTypeDrawerOpen(false)}
        onSaved={onPayTypeSaved}
      />
      <RuleBuilderDrawer
        open={ruleBuilderOpen}
        payType={rulePayType}
        onClose={() => setRuleBuilderOpen(false)}
        onSaved={onPayTypeSaved}
      />
      <SalaryAssignmentDrawer
        open={assignDrawerOpen}
        onClose={() => setAssignDrawerOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(deletingPayType)}
        title="Delete pay type?"
        description={`"${deletingPayType?.name ?? ""}" will be permanently removed. Employees using this pay type will fall back to the default rules.`}
        confirmLabel={deleteMut.isPending ? "Deleting…" : "Delete Pay Type"}
        onCancel={() => setDeletingPayType(null)}
        onConfirm={() => deletingPayType && deleteMut.mutate(deletingPayType.id)}
      />
      {toast ? <div className="fixed bottom-6 right-6 z-50"><ToastNotification title="Pay type updated" description={toast} type="success" /></div> : null}
    </div>
  );
}
