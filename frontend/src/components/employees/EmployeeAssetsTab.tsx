import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-system/StatusBadge";
import { agentThemeFor } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";
import { createAsset, getAssets, getAssetTypes, updateAssetStatus, type AssetRecord } from "@/services/assets";

export function EmployeeAssetsTab({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const [assigningAsset, setAssigningAsset] = useState(false);
  const [assetForm, setAssetForm] = useState({ asset_type: "", asset_name: "", validity_date: "" });

  const assetsQuery = useQuery({
    queryKey: ["employee-assets", employeeId],
    queryFn: () => getAssets(employeeId),
    enabled: Boolean(employeeId),
  });

  const assetTypesQuery = useQuery({
    queryKey: ["asset-types"],
    queryFn: getAssetTypes,
    enabled: assigningAsset,
  });

  const createAssetMutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async () => {
      setAssigningAsset(false);
      setAssetForm({ asset_type: "", asset_name: "", validity_date: "" });
      await queryClient.invalidateQueries({ queryKey: ["employee-assets", employeeId] });
    },
  });

  const assetStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateAssetStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employee-assets", employeeId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" variant={assigningAsset ? "outline" : "default"} onClick={() => setAssigningAsset((v) => !v)}>
          {assigningAsset ? "Cancel" : "+ Add Asset"}
        </Button>
      </div>

      {assigningAsset ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-semibold">New Asset Assignment</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Asset Type</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={assetForm.asset_type}
                onChange={(event) => setAssetForm((current) => ({ ...current, asset_type: event.target.value }))}
              >
                <option value="">{assetTypesQuery.isLoading ? "Loading types..." : "Select type"}</option>
                {(assetTypesQuery.data?.types ?? []).map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Asset Name/Model (Optional)</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={assetForm.asset_name}
                onChange={(event) => setAssetForm((current) => ({ ...current, asset_name: event.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">Validity / Expiry Date (Optional)</span>
              <input
                type="date"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={assetForm.validity_date}
                onChange={(event) => setAssetForm((current) => ({ ...current, validity_date: event.target.value }))}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!employeeId || !assetForm.asset_type || createAssetMutation.isPending}
              onClick={() =>
                createAssetMutation.mutate({
                  employee_id: employeeId,
                  asset_type: assetForm.asset_type,
                  asset_name: assetForm.asset_name || undefined,
                  validity_date: assetForm.validity_date || undefined,
                })
              }
            >
              {createAssetMutation.isPending ? "Assigning..." : "Assign Asset"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">
          {assetsQuery.isLoading ? "Loading…" : `Assets (${assetsQuery.data?.length ?? 0})`}
        </p>
      </div>
      {assetsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading assets...</p> : null}
      {!assetsQuery.isLoading && !assetsQuery.data?.length ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No assets assigned.</p>
      ) : null}
      {(assetsQuery.data ?? []).length ? (
        <div className="divide-y rounded-lg border">
          {(assetsQuery.data ?? []).map((asset: AssetRecord) => (
            <div key={asset.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", agentThemeFor("asset_agent").icon)}>
                  <Laptop className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {asset.asset_type}{asset.asset_name ? ` — ${asset.asset_name}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{asset.asset_code}</p>
                  {asset.validity_date ? (
                    <p className={cn("text-xs", asset.is_expired ? "text-rose-600 font-medium" : "text-muted-foreground")}>
                      {asset.is_expired ? "⚠ Expired " : "Valid until "}{asset.validity_date}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge
                  status={asset.asset_status.replace(/_/g, " ")}
                  tone={asset.asset_status === "ASSIGNED" ? "success" : asset.asset_status === "RETURNED" ? "neutral" : asset.asset_status === "LOST" ? "danger" : "warning"}
                />
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  {asset.asset_status === "ASSIGNED" ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => assetStatusMutation.mutate({ id: asset.id, status: "RETURN_PENDING" })}>
                      Return
                    </Button>
                  ) : null}
                  {asset.asset_status === "RETURN_PENDING" ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => assetStatusMutation.mutate({ id: asset.id, status: "RETURNED" })}>
                      Mark Returned
                    </Button>
                  ) : null}
                  {(asset.asset_status === "ASSIGNED" || asset.asset_status === "RETURN_PENDING") ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:bg-rose-50" onClick={() => assetStatusMutation.mutate({ id: asset.id, status: "LOST" })}>
                      Lost
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
