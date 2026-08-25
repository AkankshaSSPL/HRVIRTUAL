import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Armchair,
  Briefcase,
  Check,
  ChevronDown,
  CreditCard,
  HardDrive,
  Headphones,
  Laptop,
  LayoutGrid,
  Mail,
  Monitor as MonitorIcon,
  Save,
  Smartphone,
  Usb,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, DrawerPanel } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { assignOnboardingAssets, setEmployeeSeat } from "@/services/employees";
import { getSeats } from "@/services/seats";

const ROWS = ["A", "B", "C", "D", "E"];
const COLS = [1, 2, 3, 4, 5, 6, 7, 8];

const STANDARD_ASSETS = [
  { label: "Laptop", icon: Laptop },
  { label: "Accessories", icon: Briefcase },
  { label: "ID card", icon: CreditCard },
  { label: "Email access", icon: Mail },
  { label: "Software access", icon: LayoutGrid },
];

const OPTIONAL_ASSETS = [
  { label: "Hard Disk", icon: HardDrive },
  { label: "Mobile Device", icon: Smartphone },
  { label: "Pendrive", icon: Usb },
  { label: "Headphones", icon: Headphones },
  { label: "Monitor", icon: MonitorIcon },
];

// Asset types where the specific make/model is worth capturing.
const BRANDED_ASSET_LABELS = ["Laptop", "Monitor"];
const BRAND_SUGGESTIONS = ["HP", "Dell", "Lenovo", "Apple", "Asus", "Acer"];

type SeatingAllocationModalProps = {
  open: boolean;
  employeeId: string;
  currentSeat?: string | null;
  onClose: () => void;
  /** Fired after a seat is successfully saved (before onClose). Lets callers
   * continue a flow, e.g. the agent chat advancing the onboarding loop. */
  onAssigned?: (seatLabel: string) => void;
};

export function SeatingAllocationModal({ open, employeeId, currentSeat: providedCurrentSeat, onClose, onAssigned }: SeatingAllocationModalProps) {
  const queryClient = useQueryClient();
  const [pendingSeat, setPendingSeat] = useState<string | null>(null);
  const [optionalAssets, setOptionalAssets] = useState<string[]>([]);
  const [assetBrands, setAssetBrands] = useState<Record<string, string>>({});
  const [expandedBrandFields, setExpandedBrandFields] = useState<Set<string>>(new Set());
  const [justSavedAssets, setJustSavedAssets] = useState(false);

  const seatsQuery = useQuery({
    queryKey: ["seats"],
    queryFn: getSeats,
    enabled: open,
  });

  const occupancyByLabel = new Map(
    (seatsQuery.data?.seats ?? []).map((seat) => [seat.label, seat]),
  );
  
  const currentSeat = providedCurrentSeat ?? (seatsQuery.data?.seats ?? []).find((s) => s.employee_id === employeeId)?.label ?? null;

  async function invalidateAssetQueries() {
    await queryClient.invalidateQueries({ queryKey: ["employee-onboarding-progress", employeeId] });
    await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
    await queryClient.invalidateQueries({ queryKey: ["employees"] });
    await queryClient.invalidateQueries({ queryKey: ["seats"] });
    await queryClient.invalidateQueries({ queryKey: ["assets"] });
  }

  // Assigns (or re-assigns) a seat, along with whatever optional assets/brands are
  // currently selected. Used when the user picks a seat from the grid.
  const assignMutation = useMutation({
    mutationFn: ({ seatLabel, assets, assetNames }: { seatLabel: string; assets: string[]; assetNames: Record<string, string> }) =>
      setEmployeeSeat(employeeId, seatLabel, assets, assetNames),
    onSuccess: async (_data, { seatLabel }) => {
      setPendingSeat(null);
      setOptionalAssets([]);
      setAssetBrands({});
      setExpandedBrandFields(new Set());
      await invalidateAssetQueries();
      if (onAssigned) {
        onAssigned(seatLabel);
      } else {
        onClose();
      }
    },
  });

  // Saves just the optional assets/brands, without touching the seat at all
  // and without closing the modal. This is what "Confirm assets" uses —
  // needed because when a seat is already assigned, its grid button is
  // disabled and there's otherwise no way to persist a newly-ticked asset
  // like Headphones. Deliberately does NOT go through setEmployeeSeat: that
  // endpoint 400s if you resubmit a seat that's already OCCUPIED, even for
  // the same employee.
  const confirmAssetsMutation = useMutation({
    mutationFn: () => assignOnboardingAssets(employeeId, optionalAssets, assetBrands),
    onSuccess: async () => {
      await invalidateAssetQueries();
      setJustSavedAssets(true);
    },
  });

  useEffect(() => {
    if (!justSavedAssets) return;
    const timer = setTimeout(() => setJustSavedAssets(false), 2500);
    return () => clearTimeout(timer);
  }, [justSavedAssets]);

  function handleSeatClick(seatLabel: string, disabled: boolean) {
    if (disabled) return;
    setPendingSeat(seatLabel);
  }

  function toggleOptionalAsset(label: string) {
    const willBeChecked = !optionalAssets.includes(label);
    setOptionalAssets((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]));
    if (BRANDED_ASSET_LABELS.includes(label)) {
      setExpandedBrandFields((prev) => {
        const next = new Set(prev);
        if (willBeChecked) {
          next.add(label);
        } else {
          next.delete(label);
        }
        return next;
      });
    }
  }

  function toggleBrandField(label: string) {
    setExpandedBrandFields((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function setBrand(label: string, value: string) {
    setAssetBrands((prev) => ({ ...prev, [label]: value }));
  }

  function describeAssets(labels: string[]) {
    return labels
      .map((label) => (assetBrands[label] ? `${label} (${assetBrands[label]})` : label))
      .join(", ");
  }

  return (
    <>
      <DrawerPanel open={open} title="Assign Seat" size="2xl" onClose={onClose}>
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Select an available seat for this employee. Occupied seats are greyed out and can&apos;t be picked.
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <LegendSwatch className="border-muted-foreground/30 bg-card" label="Available" />
            <LegendSwatch className="border-transparent bg-muted-foreground/20" label="Occupied" />
            <LegendSwatch className="border-primary bg-primary" label="Current seat" />
          </div>

          {seatsQuery.isLoading ? (
            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">Loading seat map...</div>
          ) : seatsQuery.isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Could not load the seat map. Try closing and reopening this dialog.
            </div>
          ) : (
            <div className="space-y-2 overflow-x-auto rounded-xl border bg-muted/20 p-4 shadow-sm">
              {ROWS.map((row) => (
                <div key={row} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{row}</span>
                  <div className="flex gap-2">
                    {COLS.map((col) => {
                      const seatLabel = `${row}-${col}`;
                      const seat = occupancyByLabel.get(seatLabel);
                      const isCurrent = seatLabel === currentSeat;
                      const isOccupied = Boolean(seat?.employee_id) && !isCurrent;
                      const disabled = isOccupied || isCurrent;
                      const title = isCurrent
                        ? `${seatLabel} (current seat)`
                        : isOccupied
                          ? `${seatLabel} — occupied by ${seat?.employee_name ?? "another employee"}`
                          : seatLabel;
                      return (
                        <button
                          key={seatLabel}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSeatClick(seatLabel, disabled)}
                          title={title}
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium transition-all duration-150",
                            isCurrent
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : isOccupied
                                ? "cursor-not-allowed border-transparent bg-muted-foreground/20 text-muted-foreground/60"
                                : "border-muted-foreground/30 bg-card hover:-translate-y-0.5 hover:border-primary hover:text-primary hover:shadow-sm",
                          )}
                        >
                          {isCurrent ? <Check className="h-3.5 w-3.5" /> : <Armchair className="h-3.5 w-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentSeat ? (
            <p className="text-xs text-muted-foreground">
              Current seat: <span className="font-medium text-foreground">{currentSeat}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No seat assigned yet.</p>
          )}

          <div className="space-y-5 border-t pt-5">
            {/* Standard assets */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Briefcase className="h-3.5 w-3.5" />
                </span>
                <p className="text-sm font-semibold text-foreground">Standard assets</p>
                <span className="text-xs text-muted-foreground">assigned automatically</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {STANDARD_ASSETS.map(({ label, icon: Icon }) => {
                  const isBranded = BRANDED_ASSET_LABELS.includes(label);
                  const isExpanded = expandedBrandFields.has(label);
                  return isBranded ? (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleBrandField(label)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        isExpanded
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted-foreground/30 bg-muted/30 text-foreground hover:border-primary hover:text-primary",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                      <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  ) : (
                    <span
                      key={label}
                      className="flex items-center gap-1.5 rounded-full border border-muted-foreground/30 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {label}
                    </span>
                  );
                })}
              </div>
              {expandedBrandFields.has("Laptop") ? (
                <div className="mt-3 max-w-xs animate-in fade-in slide-in-from-top-1 duration-150">
                  <AssetBrandInput
                    label="Laptop"
                    value={assetBrands["Laptop"] ?? ""}
                    onChange={(value) => setBrand("Laptop", value)}
                  />
                </div>
              ) : null}
            </div>

            {/* Optional assets */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/10 text-muted-foreground">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </span>
                <p className="text-sm font-semibold text-foreground">Optional assets</p>
              </div>
              <div className="flex flex-col divide-y divide-muted-foreground/10">
                {OPTIONAL_ASSETS.map(({ label, icon: Icon }) => {
                  const checked = optionalAssets.includes(label);
                  return (
                    <div key={label} className="py-2 first:pt-0 last:pb-0">
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                          checked ? "bg-primary/5" : "hover:bg-muted/40",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-muted-foreground/40 accent-primary"
                          checked={checked}
                          onChange={() => toggleOptionalAsset(label)}
                        />
                        <Icon className={cn("h-3.5 w-3.5", checked ? "text-primary" : "text-muted-foreground")} />
                        <span className={checked ? "font-medium text-foreground" : "text-foreground"}>{label}</span>
                      </label>
                      {BRANDED_ASSET_LABELS.includes(label) && checked ? (
                        <div className="ml-8 mt-1.5 max-w-xs animate-in fade-in slide-in-from-top-1 duration-150">
                          <AssetBrandInput
                            label={label}
                            value={assetBrands[label] ?? ""}
                            onChange={(value) => setBrand(label, value)}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {currentSeat ? (
                <div className="mt-4 flex items-center gap-3 border-t pt-3">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={confirmAssetsMutation.isPending}
                    onClick={() => confirmAssetsMutation.mutate()}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {confirmAssetsMutation.isPending ? "Saving..." : "Confirm assets"}
                  </Button>
                  {justSavedAssets ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <Check className="h-3.5 w-3.5" /> Saved
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  Optional assets will be saved together with the seat once you pick one below.
                </p>
              )}

              {confirmAssetsMutation.isError ? (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  Could not save these assets. Please try again.
                </p>
              ) : null}
            </div>
          </div>

          {assignMutation.isError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Could not assign this seat. It may already be taken — try another.
            </p>
          ) : null}

          <div className="flex justify-end border-t pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DrawerPanel>

      <ConfirmDialog
        open={Boolean(pendingSeat)}
        title="Assign this seat?"
        description={
          pendingSeat
            ? `Seat ${pendingSeat} will be assigned to this employee${currentSeat ? `, replacing ${currentSeat}` : ""}, along with the standard onboarding kit${
                assetBrands["Laptop"] ? ` (Laptop: ${assetBrands["Laptop"]})` : ""
              }${optionalAssets.length ? ` and ${describeAssets(optionalAssets)}` : ""}.`
            : ""
        }
        confirmLabel={assignMutation.isPending ? "Assigning..." : "Assign seat and assets"}
        onCancel={() => setPendingSeat(null)}
        onConfirm={() => {
          if (pendingSeat) assignMutation.mutate({ seatLabel: pendingSeat, assets: optionalAssets, assetNames: assetBrands });
        }}
      />
    </>
  );
}

function AssetBrandInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const listId = `brand-suggestions-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`${label} brand / model (e.g. HP, Dell)`}
        className="h-8 w-full rounded-md border border-muted-foreground/30 bg-background px-2 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
      <datalist id={listId}>
        {BRAND_SUGGESTIONS.map((brand) => (
          <option key={brand} value={brand} />
        ))}
      </datalist>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-flex h-4 w-4 rounded border", className)} />
      {label}
    </span>
  );
}