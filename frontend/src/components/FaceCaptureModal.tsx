import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { canvasToBase64, detectFaces } from "@/services/faceAuth";

type FaceCaptureModalProps = {
    open: boolean;
    onClose: () => void;
    /** Throws on error; caller (parent) owns success/failure handling and closing. */
    onCapture: (images: string[]) => Promise<void>;
    /** Number of valid single-face frames required before submit is enabled. */
    targetCount?: number;
    title?: string;
    description?: string;
};

export function FaceCaptureModal({
    open,
    onClose,
    onCapture,
    targetCount = 5,
    title = "Face Enrollment",
    description = "Capture a few clear photos of your face. Make sure only one face is visible in each frame.",
}: FaceCaptureModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [frames, setFrames] = useState<string[]>([]);
    const [captureError, setCaptureError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Start/stop the webcam stream whenever the modal opens/closes.
    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        async function startCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user" },
                });
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch {
                if (!cancelled) {
                    setCameraError("Could not access the camera. Check permissions and try again.");
                }
            }
        }

        startCamera();

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, [open]);

    // Reset local state each time the modal is opened fresh.
    useEffect(() => {
        if (open) {
            setFrames([]);
            setCaptureError(null);
            setSubmitError(null);
            setCameraError(null);
            setIsSubmitting(false);
        }
    }, [open]);

    function stopCamera() {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }

    function handleClose() {
        stopCamera();
        onClose();
    }

    async function handleCapturePhoto() {
        if (!videoRef.current || !canvasRef.current) return;

        setCaptureError(null);
        setIsDetecting(true);
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const b64 = canvasToBase64(canvas);
            const { face_count } = await detectFaces(b64);

            if (face_count === 0) {
                setCaptureError("No face detected. Center your face in the frame and try again.");
                return;
            }
            if (face_count > 1) {
                setCaptureError("Multiple faces detected. Make sure only you are in frame.");
                return;
            }

            setFrames((prev) => [...prev, b64]);
        } catch {
            setCaptureError("Could not process that frame. Try again.");
        } finally {
            setIsDetecting(false);
        }
    }

    async function handleSubmit() {
        setSubmitError(null);
        setIsSubmitting(true);
        try {
            await onCapture(frames);
            stopCamera();
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : "Enrollment failed");
        } finally {
            setIsSubmitting(false);
        }
    }

    const readyToSubmit = frames.length >= targetCount;

    return (
        <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="relative overflow-hidden rounded-lg border border-border bg-slate-950 aspect-video">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-full w-full object-cover"
                        />
                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    {cameraError && (
                        <p className="text-sm text-red-600">{cameraError}</p>
                    )}

                    <div className="flex items-center justify-center gap-2">
                        {Array.from({ length: targetCount }).map((_, i) => (
                            <span
                                key={i}
                                className={`h-2.5 w-2.5 rounded-full ${i < frames.length ? "bg-emerald-500" : "bg-muted"
                                    }`}
                            />
                        ))}
                    </div>
                    <p className="text-center text-sm text-muted-foreground">
                        {frames.length} / {targetCount} captured
                    </p>

                    {captureError && <p className="text-sm text-red-600">{captureError}</p>}
                    {submitError && <p className="text-sm text-red-600">{submitError}</p>}

                    {!readyToSubmit && (
                        <Button
                            type="button"
                            className="w-full"
                            onClick={handleCapturePhoto}
                            disabled={isDetecting || !!cameraError}
                        >
                            {isDetecting ? "Checking..." : "Capture Photo"}
                        </Button>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button type="button" variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    {readyToSubmit && (
                        <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? "Submitting..." : "Submit Enrollment"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}