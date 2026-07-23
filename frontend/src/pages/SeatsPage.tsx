import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppLayout, ConfirmDialog, EmptyState, LoadingSkeleton, PageContainer, PageHeader } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { getSeats, vacateSeat, type SeatRecord } from "@/services/seats";
import { getAssets } from "@/services/assets";

const ZONE_FILTERS = ["All", "A-Zone", "B-Zone"] as const;
type ZoneFilter = (typeof ZONE_FILTERS)[number];

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  OCCUPIED: "border-red-200 bg-red-50 text-red-700",
  RESERVED: "border-blue-200 bg-blue-50 text-blue-700",
  MAINTENANCE: "border-amber-200 bg-amber-50 text-amber-700",
  BLOCKED: "border-neutral-200 bg-neutral-100 text-neutral-500",
};

const SPECIAL_STYLE = "border-purple-100 bg-purple-50 text-purple-600 cursor-default";

function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function SeatsPage() {
  const queryClient = useQueryClient();
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>("All");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [confirmingVacate, setConfirmingVacate] = useState(false);

  const seatsQuery = useQuery({
    queryKey: ["seats"],
    queryFn: getSeats,
    refetchInterval: 30000,
  });

  const seats = seatsQuery.data?.seats ?? [];
  const summary = seatsQuery.data?.summary;

  const specialSeats = seats.filter((seat) => seat.seat_type === "SPECIAL" || seat.seat_type === "MEETING_ROOM");
  const workstationSeats = seats.filter((seat) => seat.seat_type === "WORKSTATION");

  const filteredWorkstations =
    zoneFilter === "All" ? workstationSeats : workstationSeats.filter((seat) => seat.zone === zoneFilter);

  const seatsByRow = new Map<string, SeatRecord[]>();
  for (const seat of filteredWorkstations) {
    const row = seat.row ?? "?";
    if (!seatsByRow.has(row)) seatsByRow.set(row, []);
    seatsByRow.get(row)!.push(seat);
  }
  for (const seatList of seatsByRow.values()) {
    seatList.sort((a, b) => (a.col ?? 0) - (b.col ?? 0));
  }

  const selectedSeat = seats.find((seat) => seat.label === selectedLabel) ?? null;

  const assetsQuery = useQuery({
    queryKey: ["assets", selectedSeat?.employee_id],
    queryFn: () => getAssets(selectedSeat!.employee_id!),
    enabled: Boolean(selectedSeat?.employee_id),
    retry: false,
  });

  const vacateMutation = useMutation({
    mutationFn: (label: string) => vacateSeat(label),
    onSuccess: async () => {
      setConfirmingVacate(false);
      await queryClient.invalidateQueries({ queryKey: ["seats"] });
    },
  });

  const totalSeats = workstationSeats.length;
  const occupancyRate = summary && totalSeats > 0 ? Math.round((summary.occupied / totalSeats) * 100) : 0;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="Seating Layout"
          description="Real-time floor occupancy across all zones."
        />

        {seatsQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}
        {seatsQuery.isError ? (
          <EmptyState title="Unable to load seating layout" description="The seat map could not be retrieved." />
        ) : null}

        {seatsQuery.data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {summary ? (
                <>
                  <StatChip label="Available" value={summary.available} className="border-emerald-200 bg-emerald-50 text-emerald-700" />
                  <StatChip label="Occupied" value={summary.occupied} className="border-red-200 bg-red-50 text-red-700" />
                  <StatChip label="Reserved" value={summary.reserved} className="border-blue-200 bg-blue-50 text-blue-700" />
                  <StatChip label="Maintenance" value={summary.maintenance} className="border-amber-200 bg-amber-50 text-amber-700" />
                  <StatChip label="Blocked" value={summary.blocked} className="border-neutral-200 bg-neutral-100 text-neutral-500" />
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {ZONE_FILTERS.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => setZoneFilter(zone)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    zoneFilter === zone
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 bg-card text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  {zone}
                </button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                {specialSeats.length > 0 ? (
                  <div className="flex flex-wrap gap-2 border-b pb-4">
                    {specialSeats.map((seat) => (
                      <button
                        key={seat.label}
                        type="button"
                        onClick={() => setSelectedLabel(seat.label)}
                        title={seat.label}
                        className={cn(
                          "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                          SPECIAL_STYLE,
                          selectedLabel === seat.label && "ring-2 ring-purple-300",
                        )}
                      >
                        {seat.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2 overflow-x-auto">
                  {Array.from(seatsByRow.entries()).map(([row, rowSeats]) => (
                    <div key={row} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-xs font-semibold text-muted-foreground">{row}</span>
                      <div className="flex flex-wrap gap-2">
                        {rowSeats.map((seat) => (
                          <button
                            key={seat.label}
                            type="button"
                            onClick={() => setSelectedLabel(seat.label)}
                            title={seat.employee_name ? `${seat.label} — ${seat.employee_name}` : seat.label}
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium transition-colors",
                              STATUS_STYLES[seat.status] ?? "border-muted-foreground/30 bg-card",
                              selectedLabel === seat.label && "ring-2 ring-primary/50",
                            )}
                          >
                            {seat.col}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {seatsByRow.size === 0 ? (
                    <p className="text-sm text-muted-foreground">No seats in this zone.</p>
                  ) : null}
                </div>

                {summary ? (
                  <div className="border-t pt-4 text-xs text-muted-foreground">
                    {totalSeats} total &middot; {summary.available} available &middot; {summary.occupied} occupied &middot;{" "}
                    {occupancyRate}% occupancy
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border bg-card p-4">
                {selectedSeat ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{selectedSeat.label}</p>
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            STATUS_STYLES[selectedSeat.status] ?? "",
                          )}
                        >
                          {statusLabel(selectedSeat.status)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedLabel(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {selectedSeat.employee_id ? (
                      <div className="space-y-3 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{selectedSeat.employee_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedSeat.employee_designation ?? "—"} · {selectedSeat.employee_department ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">{selectedSeat.employee_email ?? "—"}</p>
                        </div>

                        <div>
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">Assets</p>
                          {assetsQuery.isLoading ? (
                            <p className="text-xs text-muted-foreground">Loading assets...</p>
                          ) : assetsQuery.isError || !assetsQuery.data?.length ? (
                            <p className="text-xs text-muted-foreground">No assets on record.</p>
                          ) : (
                            <ul className="space-y-1">
                              {assetsQuery.data.map((asset) => (
                                <li key={asset.id} className="flex items-center justify-between text-xs">
                                  <span>
                                    {asset.asset_type} · {asset.asset_code}
                                  </span>
                                  <span className="text-muted-foreground">{asset.asset_status}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 border-t pt-3">
                          <Button variant="outline" size="sm" onClick={() => setConfirmingVacate(true)}>
                            Vacate Seat
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {selectedSeat.seat_type === "WORKSTATION" ? "This seat is currently unoccupied." : "Shared space."}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a seat to see details.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <ConfirmDialog
          open={confirmingVacate}
          title="Vacate this seat?"
          description={
            selectedSeat
              ? `${selectedSeat.employee_name ?? "The occupant"} will be removed from seat ${selectedSeat.label}.`
              : ""
          }
          confirmLabel={vacateMutation.isPending ? "Vacating..." : "Vacate Seat"}
          onCancel={() => setConfirmingVacate(false)}
          onConfirm={() => {
            if (selectedSeat) vacateMutation.mutate(selectedSeat.label);
          }}
        />
      </PageContainer>
    </AppLayout>
  );
}

function StatChip({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 font-medium", className)}>
      {label} {value}
    </span>
  );
}

export const seatsPageIcon = LayoutGrid;