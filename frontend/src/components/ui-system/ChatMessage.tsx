import type { ReactNode } from "react";
import { Bot, Clock3, UserCircle } from "lucide-react";

import { agentThemeFor } from "@/lib/agent-theme";
import { cn } from "@/lib/utils";

type ChatMessageProps = {
  sender: "user" | "agent";
  name: string;
  time: string;
  children: ReactNode;
  avatar?: ReactNode;
  meta?: ReactNode;
  agentName?: string | null;
};

export function ChatMessage({ sender, name, time, children, avatar, meta, agentName }: ChatMessageProps) {
  const theme = agentThemeFor(agentName ?? name);
  return (
    <div className={cn("flex gap-3", sender === "user" ? "justify-end" : "justify-start")}>
      {sender === "agent" ? (
        <div className={cn("mt-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm", theme.icon)}>
          {avatar ?? <Bot className="h-4 w-4" />}
        </div>
      ) : null}
      <div className={cn("max-w-[88%] space-y-1", sender === "user" ? "items-end" : "items-start")}>
        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", sender === "user" && "justify-end")}>
          <span className="font-medium">{name}</span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {time}
          </span>
          {meta}
        </div>
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm shadow-soft",
            sender === "user" ? "bg-primary text-primary-foreground" : cn("text-card-foreground", theme.soft),
          )}
        >
          {children}
        </div>
      </div>
      {sender === "user" ? (
        <div className="mt-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {avatar ?? <UserCircle className="h-4 w-4" />}
        </div>
      ) : null}
    </div>
  );
}

export function UserMessageBubble({ children, time = "Now" }: { children: ReactNode; time?: string }) {
  return (
    <ChatMessage sender="user" name="You" time={time}>
      {children}
    </ChatMessage>
  );
}

export function AgentMessageBubble({
  children,
  time = "Now",
  name = "Agent Orchestrator",
  avatar,
  meta,
  agentName,
}: {
  children: ReactNode;
  time?: string;
  name?: string;
  avatar?: ReactNode;
  meta?: ReactNode;
  agentName?: string | null;
}) {
  return (
    <ChatMessage sender="agent" name={name} time={time} avatar={avatar} meta={meta} agentName={agentName ?? name}>
      {children}
    </ChatMessage>
  );
}
