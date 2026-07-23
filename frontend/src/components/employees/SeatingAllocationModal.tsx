import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Armchair, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, DrawerPanel } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { setEmployeeSeat } from "@/services/employees";
import { getSeats } from "@/services/seats";

const ROWS = ["A", "B", "C", "D", "E"];
const COLS = [1, 2, 3, 4, 5, 6, 7, 8];

type SeatingAllocationModalProps = {
  open: boolean;
  employeeId: string;
  currentSeat?: string | null;
  onClose: () => void;
  /** Fired after a seat is successfully saved (before onClose). Lets callers
   * continue a flow, e.g. the agent chat advancing the onboarding loop. */
  onAssigned?: (seatLabel: string) => void;
};

export function SeatingAllocationModal({ open, employeeId, currentSeat, onClose, onAssigned }: SeatingAllocationModalProps) {
  const queryClient = useQueryClient();
  const [pendingSeat, setPendingSeat] = useState<string | null>(null);

  const seatsQuery = useQuery({
    queryKey: ["seats"],
    queryFn: getSeats,
    enabled: open,
  });

  const occupancyByLabel = new Map(
    (seatsQuery.data?.seats ?? []).map((seat) => [seat.label, seat]),
  );

  const assignMutation = useMutation({
    mutationFn: (seatLabel: string) => setEmployeeSeat(employeeId, seatLabel),
    onSuccess: async (_data, seatLabel) => {
      setPendingSeat(null);
      await queryClient.invalidateQueries({ queryKey: ["employee-onboarding-progress", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["seats"] });
      if (onAssigned) {
        onAssigned(seatLabel);
      } else {
        onClose();
      }
    },
  });

  function handleSeatClick(seatLabel: string, disabled: boolean) {
    if (disabled) return;
    setPendingSeat(seatLabel);
  }

  return (
    <>
      <DrawerPanel open={open} title="Assign Seat" size="lg" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select an available seat for this employee. Occupied seats are greyed out and can&apos;t be picked.
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <LegendSwatch className="border-muted-foreground/30 bg-card" label="Available" />
            <LegendSwatch className="border-transparent bg-muted-foreground/20" label="Occupied" />
            <LegendSwatch className="border-primary bg-primary" label="Current seat" />
          </div>

          {seatsQuery.isLoading ? (
            <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">Loading seat map...</div>
          ) : seatsQuery.isError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Could not load the seat map. Try closing and reopening this dialog.
            </div>
          ) : (
            <div className="space-y-2 overflow-x-auto rounded-md border bg-muted/20 p-4">
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
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium transition-colors",
                            isCurrent
                              ? "border-primary bg-primary text-primary-foreground"
                              : isOccupied
                                ? "cursor-not-allowed border-transparent bg-muted-foreground/20 text-muted-foreground/60"
                                : "border-muted-foreground/30 bg-card hover:border-primary hover:text-primary",
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

          {assignMutation.isError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
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
            ? `Seat ${pendingSeat} will be assigned to this employee${currentSeat ? `, replacing ${currentSeat}` : ""}.`
            : ""
        }
        confirmLabel={assignMutation.isPending ? "Assigning..." : "Assign Seat"}
        onCancel={() => setPendingSeat(null)}
        onConfirm={() => {
          if (pendingSeat) assignMutation.mutate(pendingSeat);
        }}
      />
    </>
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