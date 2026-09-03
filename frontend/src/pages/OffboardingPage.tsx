import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { AppLayout } from "@/components/ui-system/AppLayout";
import { PageHeader } from "@/components/ui-system/PageHeader";
import { StatusBadge } from "@/components/ui-system/StatusBadge";
import { DataTable } from "@/components/ui-system/DataTable";
import { ConfirmDialog } from "@/components/ui-system/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { getEmployees, type EmployeeRecord } from "@/services/employees";
import {
    finalizeOffboarding,
    getOffboarding,
    initiateOffboarding,
    listOffboarding,
    updateOffboarding,
    type OffboardingDetail,
    type OffboardingListItem,
} from "@/services/offboarding";

const EXIT_TYPES = ["RESIGNATION", "TERMINATION", "RETIREMENT", "END_OF_CONTRACT"];

export default function OffboardingPage() {
    const [cases, setCases] = useState<OffboardingListItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [startOpen, setStartOpen] = useState(false);
    const [activeEmployees, setActiveEmployees] = useState<EmployeeRecord[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
    const [exitType, setExitType] = useState(EXIT_TYPES[0]);
    const [exitDate, setExitDate] = useState("");
    const [exitReason, setExitReason] = useState("");
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);

    const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);
    const [detail, setDetail] = useState<OffboardingDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
    const [finalizing, setFinalizing] = useState(false);

    async function loadCases() {
        setLoading(true);
        try {
            const data = await listOffboarding("IN_PROGRESS");
            setCases(data);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadCases();
    }, []);

    async function openStartDialog() {
        const { items } = await getEmployees();
        // ASSUMPTION: "ACTIVE" is the employment_status value for currently
        // active employees. Confirm against the real enum in
        // models/employee/models.py if this filter comes back empty.
        setActiveEmployees(items.filter((e) => e.status === "ACTIVE"));
        setStartOpen(true);
    }

    async function handleStart() {
        setStartError(null);
        if (!selectedEmployeeId || !exitDate) {
            setStartError("Select an employee and an exit date.");
            return;
        }
        setStarting(true);
        try {
            await initiateOffboarding(selectedEmployeeId, {
                exit_type: exitType,
                exit_date: exitDate,
                exit_reason: exitReason || undefined,
            });
            setStartOpen(false);
            setSelectedEmployeeId("");
            setExitDate("");
            setExitReason("");
            await loadCases();
        } catch (err) {
            setStartError(err instanceof Error ? err.message : "Could not start offboarding.");
        } finally {
            setStarting(false);
        }
    }

    async function openDetail(employeeId: string) {
        setDetailEmployeeId(employeeId);
        setDetailLoading(true);
        try {
            const data = await getOffboarding(employeeId);
            setDetail(data);
        } finally {
            setDetailLoading(false);
        }
    }

    function closeDetail() {
        setDetailEmployeeId(null);
        setDetail(null);
    }

    async function toggleManualItem(key: string, value: boolean) {
        if (!detailEmployeeId) return;
        const updated = await updateOffboarding(detailEmployeeId, { [key]: value });
        setDetail(updated);
    }

    async function handleFinalize() {
        if (!detailEmployeeId) return;
        setFinalizing(true);
        try {
            await finalizeOffboarding(detailEmployeeId);
            setConfirmFinalizeOpen(false);
            closeDetail();
            await loadCases();
        } finally {
            setFinalizing(false);
        }
    }

    const columns = useMemo<ColumnDef<OffboardingListItem>[]>(
        () => [
            { accessorKey: "employee_name", header: "Employee" },
            { accessorKey: "exit_type", header: "Exit Type" },
            { accessorKey: "exit_date", header: "Exit Date" },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge
                        status={row.original.status === "COMPLETED" ? "Completed" : "In progress"}
                        tone={row.original.status === "COMPLETED" ? "success" : "warning"}
                    />
                ),
            },
            {
                accessorKey: "percent",
                header: "Progress",
                cell: ({ row }) => `${row.original.percent}%`,
            },
        ],
        [],
    );

    return (
        <AppLayout>
            <div className="space-y-6">
                <PageHeader
                    title="Offboarding"
                    description="Track exiting employees through the offboarding checklist."
                    actions={<Button onClick={openStartDialog}>Start Offboarding</Button>}
                />

                <DataTable
                    data={cases}
                    columns={columns}
                    getRowId={(row) => row.employee_id}
                    loading={loading}
                    emptyTitle="No offboarding cases"
                    emptyDescription="Start offboarding an employee to see it here."
                    renderRowActions={(row) => (
                        <Button variant="ghost" size="sm" onClick={() => openDetail(row.employee_id)}>
                            View
                        </Button>
                    )}
                />
            </div>

            {startOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
                    <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-soft">
                        <h2 className="text-base font-semibold">Start Offboarding</h2>

                        <div className="mt-4 space-y-3">
                            <select
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            >
                                <option value="">Select employee…</option>
                                {activeEmployees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.name ?? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim()}
                                    </option>
                                ))}
                            </select>

                            <select
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={exitType}
                                onChange={(e) => setExitType(e.target.value)}
                            >
                                {EXIT_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t.replace("_", " ")}
                                    </option>
                                ))}
                            </select>

                            <input
                                type="date"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={exitDate}
                                onChange={(e) => setExitDate(e.target.value)}
                            />

                            <textarea
                                placeholder="Exit reason (optional)"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={exitReason}
                                onChange={(e) => setExitReason(e.target.value)}
                            />
                        </div>

                        {startError && <p className="mt-2 text-sm text-red-600">{startError}</p>}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setStartOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleStart} disabled={starting}>
                                {starting ? "Starting…" : "Start"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {detailEmployeeId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
                    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
                        <div className="flex items-center justify-between border-b px-6 py-4">
                            <h2 className="text-lg font-semibold">Offboarding Checklist</h2>
                            <Button variant="ghost" size="sm" onClick={closeDetail}>
                                Close
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">

                        {detailLoading || !detail ? (
                            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
                        ) : (
                            <div className="mt-4 space-y-6">
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground">Final Settlement Info</h3>
                                    <div className="rounded-md border bg-muted/40 p-3 text-sm">
                                        <div className="grid grid-cols-2 gap-y-2">
                                            <div className="text-muted-foreground">Phone:</div>
                                            <div>{detail.personal_info.phone || "—"}</div>
                                            <div className="text-muted-foreground">Email:</div>
                                            <div className="truncate" title={detail.personal_info.official_email}>{detail.personal_info.official_email}</div>
                                            <div className="text-muted-foreground">Personal Email:</div>
                                            <div className="truncate" title={detail.personal_info.personal_email || ""}>{detail.personal_info.personal_email || "—"}</div>
                                            <div className="text-muted-foreground">PAN:</div>
                                            <div>{detail.personal_info.pan_number || "—"}</div>
                                            <div className="text-muted-foreground">AADHAR:</div>
                                            <div>{detail.personal_info.aadhaar_number || "—"}</div>
                                            <div className="text-muted-foreground">Address:</div>
                                            <div className="col-span-2 mt-1 rounded bg-background p-2 text-xs border">{detail.personal_info.address || "No address on file."}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground">Assigned Assets</h3>
                                    {detail.assets.length === 0 ? (
                                        <p className="text-sm text-muted-foreground border rounded-md p-3">No assets currently assigned.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {detail.assets.map((asset, i) => (
                                                <li key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-muted/20">
                                                    <div>
                                                        <span className="font-medium">{asset.asset_type.replace(/_/g, " ")}</span>
                                                        {asset.asset_name && <span className="ml-2 text-muted-foreground">({asset.asset_name})</span>}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground font-mono bg-background px-1.5 py-0.5 rounded border">{asset.asset_code}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                                        <p className="text-xs text-muted-foreground font-medium bg-muted px-2 py-1 rounded-full">{detail.checklist.percent}% complete</p>
                                    </div>
                                    <ul className="space-y-2">
                                        {detail.checklist.items.map((item) => (
                                            <li
                                                key={item.key}
                                                className="flex items-center justify-between rounded-md border px-3 py-2 bg-card"
                                            >
                                                <span className="text-sm">{item.label}</span>
                                                {item.auto ? (
                                                    <StatusBadge
                                                        status={item.complete ? "Done" : "Pending"}
                                                        tone={item.complete ? "success" : "neutral"}
                                                    />
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={item.complete}
                                                        onChange={(e) => toggleManualItem(item.key, e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                    />
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {detail.case.status !== "COMPLETED" && (
                                    <Button
                                        className="w-full mt-4"
                                        disabled={!detail.checklist.can_finalize}
                                        onClick={() => setConfirmFinalizeOpen(true)}
                                    >
                                        Finalize Offboarding
                                    </Button>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmFinalizeOpen}
                title="Finalize offboarding?"
                description="This revokes access, releases the seat, marks assets returned, and removes face login. This cannot be undone."
                confirmLabel={finalizing ? "Finalizing…" : "Finalize"}
                onConfirm={handleFinalize}
                onCancel={() => setConfirmFinalizeOpen(false)}
            />
        </AppLayout>
    );
}