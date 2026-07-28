import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AppLayout,
  ConfirmDialog,
  DataTable,
  DrawerPanel,
  PageContainer,
  PageHeader,
  StatusBadge,
} from "@/components/ui-system";
import { cn } from "@/lib/utils";
import {
  createAsset,
  getAssetTypes,
  getAssets,
  updateAssetStatus,
  type AssetRecord,
} from "@/services/assets";
import { getEmployees } from "@/services/employees";

const STATUS_FILTERS = ["All", "ASSIGNED", "RETURN_PENDING", "RETURNED", "LOST"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<Exclude<StatusFilter, "All">, string> = {
  ASSIGNED: "Assigned",
  RETURN_PENDING: "Return Pending",
  RETURNED: "Returned",
  LOST: "Lost",
};

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  ASSIGNED: "success",
  RETURN_PENDING: "warning",
  RETURNED: "neutral",
  LOST: "danger",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function employeeDisplayName(emp: { name?: string | null; first_name?: string | null; last_name?: string | null; employee_code?: string | null }) {
  return emp.name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") || emp.employee_code || "Unnamed";
}

type AddAssetForm = {
  employee_id: string;
  asset_type: string;
  asset_name: string;
  validity_date: string;
};

const EMPTY_FORM: AddAssetForm = { employee_id: "", asset_type: "", asset_name: "", validity_date: "" };

export function AssetsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddAssetForm>(EMPTY_FORM);
  const [lostConfirmId, setLostConfirmId] = useState<string | null>(null);

  const assetsQuery = useQuery({ queryKey: ["assets"], queryFn: () => getAssets() });
  const employeesQuery = useQuery({ queryKey: ["employees", "for-assets"], queryFn: getEmployees, enabled: addOpen });
  const assetTypesQuery = useQuery({ queryKey: ["asset-types"], queryFn: getAssetTypes, enabled: addOpen });

  const createMutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async () => {
      setAddOpen(false);
      setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateAssetStatus(id, status),
    onSuccess: async () => {
      setLostConfirmId(null);
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const assets = assetsQuery.data ?? [];
  const filtered = useMemo(
    () => (statusFilter === "All" ? assets : assets.filter((a) => a.asset_status === statusFilter)),
    [assets, statusFilter],
  );

  const lostTarget = assets.find((a) => a.id === lostConfirmId) ?? null;

  const columns: ColumnDef<AssetRecord>[] = [
    {
      accessorKey: "asset_code",
      header: "Asset Code",
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
    },
    { accessorKey: "asset_type", header: "Type" },
    {
      accessorKey: "asset_name",
      header: "Name",
      cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "employee_name",
      header: "Employee",
      cell: ({ row }) => (
        <Link to={`/employees/${row.original.employee_id}`} className="text-primary hover:underline">
          {row.original.employee_name}
        </Link>
      ),
    },
    {
      accessorKey: "assigned_at",
      header: "Assigned At",
      cell: ({ getValue }) => formatDate(getValue<string | null>()),
    },
    {
      id: "validity",
      header: "Validity",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span>{formatDate(row.original.validity_date)}</span>
          {row.original.is_expired ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
              Expired
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "asset_status",
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue<string>();
        return <StatusBadge status={STATUS_LABELS[status as Exclude<StatusFilter, "All">] ?? status} tone={STATUS_TONE[status] ?? "neutral"} />;
      },
    },
  ];

  const canSubmit = Boolean(form.employee_id && form.asset_type) && !createMutation.isPending;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Assets" description="Track and manage employee equipment assignments." />

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === status
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30 bg-card text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              {status === "All" ? "All" : STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(row) => row.id}
          loading={assetsQuery.isLoading}
          searchPlaceholder="Search by employee or asset code"
          emptyTitle="No assets found"
          emptyDescription="Add an asset to get started."
          actions={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Add Asset
            </Button>
          }
          renderRowActions={(asset) => (
            <div className="flex justify-end gap-2">
              {asset.asset_status === "ASSIGNED" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => statusMutation.mutate({ id: asset.id, status: "RETURN_PENDING" })}
                >
                  Return
                </Button>
              ) : null}
              {asset.asset_status === "RETURN_PENDING" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => statusMutation.mutate({ id: asset.id, status: "RETURNED" })}
                >
                  Mark Returned
                </Button>
              ) : null}
              {(asset.asset_status === "ASSIGNED" || asset.asset_status === "RETURN_PENDING") ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50"
                  onClick={() => setLostConfirmId(asset.id)}
                >
                  Lost
                </Button>
              ) : null}
            </div>
          )}
        />

        <DrawerPanel open={addOpen} title="Add Asset" size="md" onClose={() => setAddOpen(false)}>
          <form
            className="space-y-4 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              createMutation.mutate({
                employee_id: form.employee_id,
                asset_type: form.asset_type,
                asset_name: form.asset_name || undefined,
                validity_date: form.validity_date || undefined,
              });
            }}
          >
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Employee</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
                required
              >
                <option value="">Select employee...</option>
                {(employeesQuery.data?.items ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {employeeDisplayName(emp)}
                  </option>
                ))}
              </select>
              {employeesQuery.isLoading ? <p className="text-xs text-muted-foreground">Loading employees...</p> : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Asset Type</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.asset_type}
                onChange={(e) => setForm((f) => ({ ...f, asset_type: e.target.value }))}
                required
              >
                <option value="">Select type...</option>
                {(assetTypesQuery.data?.types ?? []).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Asset Name (optional)</label>
              <input
                type="text"
                placeholder="e.g. Dell XPS 15"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.asset_name}
                onChange={(e) => setForm((f) => ({ ...f, asset_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Validity Date (optional)</label>
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.validity_date}
                onChange={(e) => setForm((f) => ({ ...f, validity_date: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createMutation.isPending ? "Adding..." : "Add Asset"}
              </Button>
            </div>
          </form>
        </DrawerPanel>

        <ConfirmDialog
          open={Boolean(lostConfirmId)}
          title="Mark this asset as lost?"
          description={
            lostTarget
              ? `${lostTarget.asset_type}${lostTarget.asset_name ? ` — ${lostTarget.asset_name}` : ""} (${lostTarget.asset_code}) assigned to ${lostTarget.employee_name} will be marked Lost.`
              : ""
          }
          confirmLabel={statusMutation.isPending ? "Marking..." : "Mark Lost"}
          onCancel={() => setLostConfirmId(null)}
          onConfirm={() => {
            if (lostConfirmId) statusMutation.mutate({ id: lostConfirmId, status: "LOST" });
          }}
        />
      </PageContainer>
    </AppLayout>
  );
}

export const assetsPageIcon = Package;