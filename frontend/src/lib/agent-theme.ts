export type AgentThemeName =
  | "coordinator"
  | "employee"
  | "payroll"
  | "approval"
  | "notification"
  | "candidate"
  | "asset"
  | "resume"
  | "document"
  | "leave"
  | "offboarding"
  | "default";

export type AgentTheme = {
  name: AgentThemeName;
  label: string;
  tint: string;
  border: string;
  text: string;
  icon: string;
  soft: string;
  ring: string;
};

export const agentThemes: Record<AgentThemeName, AgentTheme> = {
  coordinator: {
    name: "coordinator",
    label: "Coordinator Agent",
    tint: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-900",
    text: "text-blue-700 dark:text-blue-300",
    icon: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
    soft: "bg-blue-50/60 border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/70",
    ring: "ring-blue-200/70",
  },
  employee: {
    name: "employee",
    label: "Employee Agent",
    tint: "bg-indigo-50 dark:bg-indigo-950/40",
    border: "border-indigo-200 dark:border-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
    icon: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-900",
    soft: "bg-indigo-50/60 border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/70",
    ring: "ring-indigo-200/70",
  },
  payroll: {
    name: "payroll",
    label: "Payroll Agent",
    tint: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
    soft: "bg-emerald-50/60 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/70",
    ring: "ring-emerald-200/70",
  },
  approval: {
    name: "approval",
    label: "Approval Agent",
    tint: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-900",
    text: "text-amber-700 dark:text-amber-300",
    icon: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    soft: "bg-amber-50/60 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/70",
    ring: "ring-amber-200/70",
  },
  notification: {
    name: "notification",
    label: "Notification Agent",
    tint: "bg-cyan-50 dark:bg-cyan-950/40",
    border: "border-cyan-200 dark:border-cyan-900",
    text: "text-cyan-700 dark:text-cyan-300",
    icon: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-900",
    soft: "bg-cyan-50/60 border-cyan-100 dark:bg-cyan-950/30 dark:border-cyan-900/70",
    ring: "ring-cyan-200/70",
  },
  candidate: {
    name: "candidate",
    label: "Candidate Agent",
    tint: "bg-teal-50 dark:bg-teal-950/40",
    border: "border-teal-200 dark:border-teal-900",
    text: "text-teal-700 dark:text-teal-300",
    icon: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-900",
    soft: "bg-teal-50/60 border-teal-100 dark:bg-teal-950/30 dark:border-teal-900/70",
    ring: "ring-teal-200/70",
  },
  asset: {
    name: "asset",
    label: "Asset Agent",
    tint: "bg-lime-50 dark:bg-lime-950/40",
    border: "border-lime-200 dark:border-lime-900",
    text: "text-lime-700 dark:text-lime-300",
    icon: "bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-950 dark:text-lime-300 dark:border-lime-900",
    soft: "bg-lime-50/60 border-lime-100 dark:bg-lime-950/30 dark:border-lime-900/70",
    ring: "ring-lime-200/70",
  },
  resume: {
    name: "resume",
    label: "Resume Parser Agent",
    tint: "bg-sky-50 dark:bg-sky-950/40",
    border: "border-sky-200 dark:border-sky-900",
    text: "text-sky-700 dark:text-sky-300",
    icon: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
    soft: "bg-sky-50/60 border-sky-100 dark:bg-sky-950/30 dark:border-sky-900/70",
    ring: "ring-sky-200/70",
  },
  document: {
    name: "document",
    label: "Document Agent",
    tint: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-900",
    text: "text-orange-700 dark:text-orange-300",
    icon: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900",
    soft: "bg-orange-50/60 border-orange-100 dark:bg-orange-950/30 dark:border-orange-900/70",
    ring: "ring-orange-200/70",
  },
  leave: {
    name: "leave",
    label: "Leave Agent",
    tint: "bg-purple-50 dark:bg-purple-950/40",
    border: "border-purple-200 dark:border-purple-900",
    text: "text-purple-700 dark:text-purple-300",
    icon: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900",
    soft: "bg-purple-50/60 border-purple-100 dark:bg-purple-950/30 dark:border-purple-900/70",
    ring: "ring-purple-200/70",
  },
  offboarding: {
    name: "offboarding",
    label: "Offboarding Agent",
    tint: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-900",
    text: "text-rose-700 dark:text-rose-300",
    icon: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
    soft: "bg-rose-50/60 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/70",
    ring: "ring-rose-200/70",
  },
  default: {
    name: "default",
    label: "Agent",
    tint: "bg-slate-50 dark:bg-zinc-900/60",
    border: "border-slate-200 dark:border-zinc-800",
    text: "text-slate-700 dark:text-zinc-300",
    icon: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800",
    soft: "bg-slate-50/70 border-slate-200 dark:bg-zinc-900/50 dark:border-zinc-800",
    ring: "ring-slate-200/70",
  },
};

export function agentThemeFor(agent?: string | null): AgentTheme {
  const normalized = (agent ?? "").toLowerCase();
  if (normalized.includes("coordinator")) return agentThemes.coordinator;
  if (normalized.includes("employee")) return agentThemes.employee;
  if (normalized.includes("payroll")) return agentThemes.payroll;
  if (normalized.includes("approval")) return agentThemes.approval;
  if (normalized.includes("notification")) return agentThemes.notification;
  if (normalized.includes("candidate")) return agentThemes.candidate;
  if (normalized.includes("asset")) return agentThemes.asset;
  if (normalized.includes("resume")) return agentThemes.resume;
  if (normalized.includes("document")) return agentThemes.document;
  if (normalized.includes("leave")) return agentThemes.leave;
  if (normalized.includes("offboarding")) return agentThemes.offboarding;
  return agentThemes.default;
}

export function statusToneFor(status?: string | null): "neutral" | "success" | "warning" | "danger" | "info" {
  const normalized = (status ?? "").toUpperCase();
  if (normalized.includes("COMPLETED") || normalized.includes("APPROVED") || normalized.includes("ACTIVE") || normalized.includes("EXECUTED")) return "success";
  if (normalized.includes("RUNNING") || normalized.includes("WORKING")) return "info";
  if (normalized.includes("WAIT") || normalized.includes("PENDING") || normalized.includes("APPROVAL") || normalized.includes("NEEDS")) return "warning";
  if (normalized.includes("FAILED") || normalized.includes("REJECT") || normalized.includes("ERROR") || normalized.includes("EXIT")) return "danger";
  return "neutral";
}
