import { Paperclip, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type CommandInputProps = {
  placeholder?: string;
  onSend?: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onAttach?: (file: File) => void;
  draftValue?: string;
  onDraftConsumed?: () => void;
};

export function CommandInput({ placeholder = "Issue an HR operations command", onSend, disabled = false, loading = false, error, onAttach, draftValue, onDraftConsumed }: CommandInputProps) {
  const [value, setValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!draftValue) return;
    setValue(draftValue);
    onDraftConsumed?.();
  }, [draftValue, onDraftConsumed]);

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled || loading) return;
    onSend?.(trimmed);
    setValue("");
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        disabled={disabled || loading}
        className="min-h-20 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onAttach?.(file);
            event.currentTarget.value = "";
          }}
        />
        <Button variant="ghost" size="sm" type="button" disabled={disabled || loading} onClick={() => fileInputRef.current?.click()}>
          <Paperclip className="h-4 w-4" />
          Attach
        </Button>
        <Button type="button" onClick={send} disabled={disabled || loading}>
          <SendHorizontal className="h-4 w-4" />
          {loading ? "Sending" : "Send"}
        </Button>
      </div>
    </div>
  );
}
