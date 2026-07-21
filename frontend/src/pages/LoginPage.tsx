import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppLayout, ErrorState } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

const agentCards = [
  { name: "Payroll Agent", status: "Cycle validation", icon: FileCheck2, tone: "text-sky-200", delay: 0 },
  { name: "Approval Agent", status: "3 gates pending", icon: ShieldCheck, tone: "text-emerald-200", delay: 0.15 },
  { name: "Onboarding Agent", status: "Readiness scan", icon: Workflow, tone: "text-amber-200", delay: 0.3 },
  { name: "Compliance Agent", status: "Policy checks live", icon: Fingerprint, tone: "text-indigo-200", delay: 0.45 },
];

const metrics = [
  { label: "Employees Managed", value: "Live" },
  { label: "AI Agents Active", value: "06" },
  { label: "Automated Workflows", value: "148" },
  { label: "Pending Approvals", value: "32" },
];

function OperationsIllustration() {
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] p-6 shadow-2xl backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,0.20),transparent_35%),radial-gradient(circle_at_85%_65%,rgba(16,185,129,0.14),transparent_30%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-55" viewBox="0 0 720 420" role="img" aria-label="AI operations workflow">
        <defs>
          <linearGradient id="login-flow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.75" />
          </linearGradient>
          <filter id="soft-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M120 210 C210 80 330 100 380 205 S545 345 620 185" fill="none" stroke="url(#login-flow)" strokeWidth="2" strokeDasharray="8 10" />
        <path d="M132 292 C255 245 295 315 390 250 S540 140 612 266" fill="none" stroke="#94a3b8" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 9" />
        {[
          [120, 210, 42],
          [280, 128, 34],
          [390, 242, 54],
          [560, 172, 38],
          [608, 274, 30],
        ].map(([cx, cy, r], index) => (
          <g key={`${cx}-${cy}`} filter="url(#soft-glow)">
            <circle cx={cx} cy={cy} r={r} fill="#0f172a" stroke="url(#login-flow)" strokeWidth="2" />
            <circle cx={cx} cy={cy} r={r - 12} fill="#1e293b" stroke="#ffffff" strokeOpacity="0.08" />
            <circle cx={cx} cy={cy} r="4" fill={index === 2 ? "#34d399" : "#60a5fa"} />
          </g>
        ))}
        <g opacity="0.32">
          {Array.from({ length: 9 }).map((_, index) => (
            <line key={index} x1={80 + index * 70} y1="40" x2={80 + index * 70} y2="380" stroke="#94a3b8" strokeWidth="1" />
          ))}
          {Array.from({ length: 6 }).map((_, index) => (
            <line key={index} x1="55" y1={70 + index * 58} x2="665" y2={70 + index * 58} stroke="#94a3b8" strokeWidth="1" />
          ))}
        </g>
      </svg>

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/75">
            <Activity className="h-3.5 w-3.5 text-emerald-200" />
            Live orchestration
          </div>
          <h2 className="mt-5 max-w-lg text-4xl font-semibold tracking-normal text-white">
            Enterprise AI Workforce Command Center
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
            Govern agentic HR workflows with approval gates, policy checks, and operational visibility from one secure workspace.
          </p>
        </div>
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="hidden rounded-lg border border-white/10 bg-slate-950/55 p-4 text-right backdrop-blur xl:block"
        >
          <p className="text-xs text-slate-400">Execution Health</p>
          <p className="mt-1 text-2xl font-semibold text-white">98.7%</p>
        </motion.div>
      </div>

      <div className="relative z-10 mt-10 grid gap-3 xl:grid-cols-2">
        {agentCards.map((agent) => (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: agent.delay, duration: 0.45, ease: "easeOut" }}
            whileHover={{ y: -3 }}
            className="rounded-lg border border-white/10 bg-slate-950/45 p-4 shadow-xl backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10">
                <agent.icon className={cn("h-5 w-5", agent.tone)} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{agent.status}</p>
              </div>
              <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.85)]" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    }
  }

  return (
    <AppLayout minimal>
      <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_500px]">
        <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-8 text-white lg:flex lg:flex-col lg:justify-between xl:px-14">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(30,64,175,0.28),transparent_38%),linear-gradient(315deg,rgba(15,118,110,0.20),transparent_34%)]" />
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:48px_48px]" />

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white ring-1 ring-white/15">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Agentic HRMS</p>
                <p className="text-xs text-slate-400">Secure AI workforce operations</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-sky-200" />
              Multi-agent ready
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="relative z-10 my-8">
            <OperationsIllustration />
          </motion.div>

          <div className="relative z-10 grid grid-cols-4 gap-3">
            {metrics.map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.08, duration: 0.35 }}
                className="rounded-lg border border-white/10 bg-white/[0.055] p-4 backdrop-blur"
              >
                <p className="text-xl font-semibold tracking-normal text-white">{metric.value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{metric.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-6">
          <motion.div initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Agentic HRMS</p>
                  <p className="text-xs text-muted-foreground">Enterprise AI Workforce Command Center</p>
                </div>
              </div>
            </div>

            <Card className="w-full border-border/80 shadow-soft">
              <CardHeader className="space-y-3 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">Sign in to command center</CardTitle>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Access protected workforce operations, approval queues, and multi-agent execution controls.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-muted/45 p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Enterprise workspace secured with JWT sessions, refresh rotation, and role-based permissions.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {error ? <ErrorState title="Login failed" message={error} /> : null}
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="email">
                      Work email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="password">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                      />
                      Remember this workspace
                    </label>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      Secure session
                    </span>
                  </div>
                  <Button className="h-11 w-full" type="submit" disabled={status === "loading"}>
                    {status === "loading" ? (
                      <Activity className="h-4 w-4 animate-spin" />
                    ) : (
                      <LockKeyhole className="h-4 w-4" />
                    )}
                    {status === "loading" ? "Verifying workspace" : "Continue securely"}
                  </Button>
                </form>
                <div className="mt-6 flex items-center justify-center gap-2 border-t pt-5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-secondary" />
                  Protected by enterprise RBAC and audit-ready access controls
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>
    </AppLayout>
  );
}
