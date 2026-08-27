


import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FaceCaptureModal } from "@/components/FaceCaptureModal";
import { useAuthStore } from "@/stores/authStore";
import {
    adminEnrollFace,
    adminRemoveFace,
    selfEnroll,
    selfRemoveFace,
} from "@/services/faceAuth";

type FaceBiometricTabProps = {
    userId: string | null;
    faceRegistered?: boolean;
    faceSamplesCount?: number;
};

export function FaceBiometricTab({
    userId,
    faceRegistered = false,
    faceSamplesCount = 0
}: FaceBiometricTabProps) {
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const initialize = useAuthStore((s) => s.initialize);

    const canManage = hasPermission("face:enroll");
    const isSelf = !!user && user.id === userId;
    const canAct = canManage || isSelf;

    const [modalOpen, setModalOpen] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
        null
    );

    async function refreshData() {
        if (isSelf) {
            await initialize();
        }
        // Also invalidate any employee queries if we are viewing an employee
        await queryClient.invalidateQueries({ queryKey: ["employees"] });
        await queryClient.invalidateQueries({ queryKey: ["employee"] });
    }

    async function handleCapture(images: string[]) {
        if (!userId) return;
        if (isSelf && !canManage) {
            await selfEnroll(images);
        } else {
            await adminEnrollFace(userId, images);
        }
        setMessage({ type: "success", text: "Face enrolled successfully." });
        setModalOpen(false);
        await refreshData();
    }

    async function handleRemove() {
        const confirmed = window.confirm(
            "Remove face enrollment for this employee? This cannot be undone."
        );
        if (!confirmed) return;
        if (!userId) return;
        setRemoving(true);
        setMessage(null);
        try {
            if (isSelf && !canManage) {
                await selfRemoveFace();
            } else {
                await adminRemoveFace(userId);
            }
            setMessage({ type: "success", text: "Face enrollment removed." });
            await refreshData();
        } catch (err) {
            setMessage({
                type: "error",
                text: err instanceof Error ? err.message : "Removal failed",
            });
        } finally {
            setRemoving(false);
        }
    }

    // Use auth store values if this is the self user, otherwise use props
    const isRegistered = isSelf ? (user?.face_registered ?? false) : faceRegistered;
    const sampleCount = isSelf ? (user?.face_samples_count ?? 0) : faceSamplesCount;

    if (!userId) {
        return (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                Face enrollment requires a linked User account. Please set an Official Email to create a User account for this employee.
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between rounded-lg border border-border p-4 relative">
            <div>
                <p
                    className={`font-medium ${isRegistered ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                >
                    {isRegistered ? "Face Enrolled" : "No Face Enrolled"}
                </p>
                {isRegistered && (
                    <p className="text-sm text-muted-foreground">
                        {sampleCount} face sample
                        {sampleCount === 1 ? "" : "s"} stored
                    </p>
                )}
                {message && (
                    <p
                        className={`text-sm mt-1 ${message.type === "success" ? "text-emerald-600" : "text-red-600"
                            }`}
                    >
                        {message.text}
                    </p>
                )}
            </div>

            {canAct && (
                <div className="flex gap-2 shrink-0">
                    <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white border-0" onClick={() => setModalOpen(true)}>
                        Enroll Face
                    </Button>
                    {isRegistered && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleRemove}
                            disabled={removing}
                        >
                            {removing ? "Removing..." : "Remove"}
                        </Button>
                    )}
                </div>
            )}

            <FaceCaptureModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onCapture={handleCapture}
            />
        </div>
    );
}
