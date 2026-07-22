import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Armchair, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, DrawerPanel } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { setEmployeeSeat } from "@/services/employees";

const ROWS = ["A", "B", "C", "D", "E"];
const COLS = [1, 2, 3, 4, 5, 6, 7, 8];

// Mock inventory: seat_label has no backing table yet, so occupancy is a
// static client-side set. Replace with a real seat inventory lookup if one
// is ever added.
const OCCUPIED_SEATS = new Set([
  "A-2", "A-5", "B-1", "B-6", "C-3", "C-4", "C-7",
  "D-2", "D-8", "E-1", "E-5", "E-6",
]);

type SeatingAllocationModalProps = {
  open: boolean;
  employeeId: string;
  currentSeat?: string | null;
  onClose: () => void;
};

export function SeatingAllocationModal({ open, employeeId, currentSeat, onClose }: SeatingAllocationModalProps) {
  const queryClient = useQueryClient();
  const [pendingSeat, setPendingSeat] = useState<string | null>(null);

  const assignMutation = useMutation({
    mutationFn: (seatLabel: string) => setEmployeeSeat(employeeId, seatLabel),
    onSuccess: async () => {
      setPendingSeat(null);
      await queryClient.invalidateQueries({ queryKey: ["employee-onboarding-progress", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      onClose();
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

          <div className="space-y-2 overflow-x-auto rounded-md border bg-muted/20 p-4">
            {ROWS.map((row) => (
              <div key={row} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{row}</span>
                <div className="flex gap-2">
                  {COLS.map((col) => {
                    const seatLabel = `${row}-${col}`;
                    const isCurrent = seatLabel === currentSeat;
                    const isOccupied = OCCUPIED_SEATS.has(seatLabel) && !isCurrent;
                    const disabled = isOccupied || isCurrent;
                    return (
                      <button
                        key={seatLabel}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleSeatClick(seatLabel, disabled)}
                        title={seatLabel}
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