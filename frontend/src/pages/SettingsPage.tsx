import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  Settings,
  Monitor,
  Palette,
  IndianRupee,
  Mail,
  Calendar,
  ShieldAlert,
  Fingerprint,
  FileBadge,
  FileSignature,
  Save,
  Database,
  Server,
  User,
  Lock,
  Clock,
  Check,
  Info,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Link,
  Eraser,
  Undo,
  Redo,
  Code,
  Bold,
  Italic,
  Strikethrough,
} from "lucide-react";
import { AppLayout, PageContainer, PageHeader } from "@/components/ui-system";
import { getSettings, updateSettings } from "@/services/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "system", label: "System Settings", icon: Monitor },
  { id: "brand", label: "Brand Settings", icon: Palette },
  { id: "email", label: "Email Settings", icon: Mail },
  { id: "working_days", label: "Working Days Settings", icon: Calendar },
  { id: "experience_certificate", label: "Experience Certificate Settings", icon: FileBadge },
  { id: "joining_letter", label: "Joining Letter Settings", icon: FileSignature },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState("system");
  
  return (
    <AppLayout>
      <PageContainer>
        <PageHeader title="Settings" description="Manage system settings." />
        <div className="flex gap-6 mt-6">
          <div className="w-64 shrink-0 rounded-xl border bg-card p-2 shadow-sm flex flex-col gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 rounded-xl border bg-card p-6 shadow-sm min-h-[500px]">
            {activeTab === "system" && <SystemSettingsTab />}
            {activeTab === "email" && <EmailSettingsTab />}
            {activeTab === "working_days" && <WorkingDaysTab />}
            {activeTab === "joining_letter" && <JoiningLetterTab />}
            {activeTab === "experience_certificate" && <ExperienceCertificateTab />}
            
            {/* Placeholders for unimplemented tabs */}
            {!["system", "email", "working_days", "joining_letter", "experience_certificate"].includes(activeTab) && (
              <div className="flex h-full items-center justify-center text-muted-foreground flex-col gap-2">
                <Settings className="h-10 w-10 opacity-20" />
                <p>This settings page is coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}

function SystemSettingsTab() {
  const queryClient = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["settings", "system"],
    queryFn: () => getSettings("system"),
  });
  
  const mutation = useMutation({
    mutationFn: (payload: Record<string, any>) => updateSettings("system", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "system"] });
      toast.success("System settings saved.");
    },
    onError: () => toast.error("Failed to save settings."),
  });

  const [form, setForm] = useState<Record<string, any>>({});
  
  // Sync form state when data loads
  if (!isLoading && Object.keys(form).length === 0 && Object.keys(settings).length > 0) {
    setForm(settings);
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const updateField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <form onSubmit={handleSave}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">System Settings</h2>
          <p className="text-sm text-muted-foreground">Configure system-wide settings for your application</p>
        </div>
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Default Language</label>
          <select 
            className="w-full rounded-md border p-2 text-sm bg-background"
            value={form.default_language || "en"}
            onChange={e => updateField("default_language", e.target.value)}
          >
            <option value="en">🇬🇧 English</option>
            <option value="es">🇪🇸 Spanish</option>
            <option value="fr">🇫🇷 French</option>
          </select>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Date Format</label>
          <select 
            className="w-full rounded-md border p-2 text-sm bg-background"
            value={form.date_format || "Y-m-d"}
            onChange={e => updateField("date_format", e.target.value)}
          >
            <option value="Y-m-d">Y-m-d (2025-01-01)</option>
            <option value="d-m-Y">d-m-Y (01-01-2025)</option>
            <option value="m/d/Y">m/d/Y (01/01/2025)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Time Format</label>
          <select 
            className="w-full rounded-md border p-2 text-sm bg-background"
            value={form.time_format || "H:i"}
            onChange={e => updateField("time_format", e.target.value)}
          >
            <option value="H:i">H:i (13:30)</option>
            <option value="h:i A">h:i A (01:30 PM)</option>
          </select>
        </div>

        <div className="space-y-2 col-span-2">
          <label className="text-sm font-medium">Default Timezone</label>
          <select 
            className="w-full rounded-md border p-2 text-sm bg-background"
            value={form.timezone || "UTC"}
            onChange={e => updateField("timezone", e.target.value)}
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="Asia/Kolkata">Asia/Kolkata</option>
          </select>
        </div>
        
        <div className="col-span-2 flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-sm font-medium">IP Restriction</p>
            <p className="text-xs text-muted-foreground">Enable IP address restrictions for enhanced security</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={form.ip_restriction === "true"} onChange={e => updateField("ip_restriction", e.target.checked ? "true" : "false")} />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <div className="col-span-2 flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-sm font-medium">Landing Page</p>
            <p className="text-xs text-muted-foreground">Enable or disable the public landing page</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={form.landing_page !== "false"} onChange={e => updateField("landing_page", e.target.checked ? "true" : "false")} />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>
      </div>
    </form>
  );
}

function EmailSettingsTab() {
  const queryClient = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["settings", "email"],
    queryFn: () => getSettings("email"),
  });
  
  const mutation = useMutation({
    mutationFn: (payload: Record<string, any>) => updateSettings("email", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "email"] });
      toast.success("Email settings saved.");
    },
    onError: () => toast.error("Failed to save settings."),
  });

  const [form, setForm] = useState<Record<string, any>>({});
  
  if (!isLoading && Object.keys(form).length === 0 && Object.keys(settings).length > 0) {
    setForm(settings);
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const updateField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="flex items-start gap-6">
      <form onSubmit={handleSave} className="flex-1">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Email Settings</h2>
            <p className="text-sm text-muted-foreground">Configure email server settings for system notifications</p>
          </div>
          <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 border rounded-xl p-4 bg-muted/20">
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4"/> Email Provider</label>
            <select className="w-full rounded-md border p-2 text-sm bg-background" value={form.email_provider || "SMTP"} onChange={e => updateField("email_provider", e.target.value)}>
              <option value="SMTP">SMTP</option>
              <option value="Mailgun">Mailgun</option>
              <option value="SES">Amazon SES</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><Database className="h-4 w-4"/> Mail Driver <span className="text-destructive">*</span></label>
            <input type="text" className="w-full rounded-md border p-2 text-sm bg-background" value={form.mail_driver || "smtp"} onChange={e => updateField("mail_driver", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><Server className="h-4 w-4"/> SMTP Host <span className="text-destructive">*</span></label>
            <input type="text" className="w-full rounded-md border p-2 text-sm bg-background" value={form.smtp_host || ""} onChange={e => updateField("smtp_host", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><Server className="h-4 w-4"/> SMTP Port <span className="text-destructive">*</span></label>
            <input type="number" className="w-full rounded-md border p-2 text-sm bg-background" value={form.smtp_port || "587"} onChange={e => updateField("smtp_port", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><User className="h-4 w-4"/> SMTP Username <span className="text-destructive">*</span></label>
            <input type="text" className="w-full rounded-md border p-2 text-sm bg-background" value={form.smtp_username || ""} onChange={e => updateField("smtp_username", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><Lock className="h-4 w-4"/> SMTP Password <span className="text-destructive">*</span></label>
            <input type="password" className="w-full rounded-md border p-2 text-sm bg-background" value={form.smtp_password || ""} onChange={e => updateField("smtp_password", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><Lock className="h-4 w-4"/> Mail Encryption <span className="text-destructive">*</span></label>
            <select className="w-full rounded-md border p-2 text-sm bg-background" value={form.mail_encryption || "TLS"} onChange={e => updateField("mail_encryption", e.target.value)}>
              <option value="TLS">TLS</option>
              <option value="SSL">SSL</option>
              <option value="None">None</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4"/> From Address <span className="text-destructive">*</span></label>
            <input type="email" className="w-full rounded-md border p-2 text-sm bg-background" value={form.from_address || ""} onChange={e => updateField("from_address", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2"><User className="h-4 w-4"/> From Name <span className="text-destructive">*</span></label>
            <input type="text" className="w-full rounded-md border p-2 text-sm bg-background" value={form.from_name || "WorkDo System"} onChange={e => updateField("from_name", e.target.value)} required />
          </div>
        </div>
      </form>

      <div className="w-64 shrink-0 border rounded-xl p-4 bg-muted/10 shadow-sm flex flex-col gap-4">
        <div className="text-center">
          <h3 className="font-medium">Test Email Configuration</h3>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Send Test To</label>
          <input type="email" placeholder="test@example.com" className="w-full rounded-md border p-2 text-sm bg-background" />
          <p className="text-[10px] text-muted-foreground mt-1 text-center">Enter an email address to send a test message</p>
        </div>
        <Button className="w-full bg-emerald-200 hover:bg-emerald-300 text-emerald-900 shadow-none border border-emerald-300">
          Send Test Email
        </Button>
      </div>
    </div>
  );
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function WorkingDaysTab() {
  const queryClient = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["settings", "working_days"],
    queryFn: () => getSettings("working_days"),
  });
  
  const mutation = useMutation({
    mutationFn: (payload: Record<string, any>) => updateSettings("working_days", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "working_days"] });
      toast.success("Working days saved.");
    },
    onError: () => toast.error("Failed to save settings."),
  });

  const [form, setForm] = useState<Record<string, any>>({});
  
  if (!isLoading && Object.keys(form).length === 0 && Object.keys(settings).length > 0) {
    setForm(settings);
  }

  // default logic if nothing is set
  const isWorkingDay = (day: string) => {
    if (form[day] === undefined) {
      return !["Saturday", "Sunday"].includes(day); // default Mon-Fri
    }
    return form[day] === "true";
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <form onSubmit={handleSave}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Working Days Settings</h2>
          <p className="text-sm text-muted-foreground">Configure which days are working days for your organization</p>
        </div>
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <div className="border rounded-xl p-6 bg-muted/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DAYS.map((day) => {
            const isWorking = isWorkingDay(day);
            return (
              <button
                type="button"
                key={day}
                onClick={() => setForm((p) => ({ ...p, [day]: isWorking ? "false" : "true" }))}
                className={cn(
                  "relative overflow-hidden flex items-center justify-between p-4 rounded-xl border transition-all duration-200 text-left w-full",
                  isWorking
                    ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                    : "border-border bg-background hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    isWorking ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground"
                  )}>
                    <Clock className="h-4 w-4" />
                  </div>
                  <span className={cn(
                    "font-medium text-sm transition-colors",
                    isWorking ? "text-emerald-900" : "text-foreground"
                  )}>{day}</span>
                </div>
                
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full transition-all",
                  isWorking ? "bg-emerald-500 text-white" : "border-2 border-muted-foreground/30 text-transparent"
                )}>
                  <Check className="h-3 w-3" strokeWidth={isWorking ? 3 : 2} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </form>
  );
}

function JoiningLetterTab() {
  const queryClient = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["settings", "joining_letter"],
    queryFn: () => getSettings("joining_letter"),
  });
  
  const mutation = useMutation({
    mutationFn: (payload: Record<string, any>) => updateSettings("joining_letter", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "joining_letter"] });
      toast.success("Joining letter saved.");
    },
    onError: () => toast.error("Failed to save settings."),
  });

  const [form, setForm] = useState<Record<string, any>>({});
  
  if (!isLoading && Object.keys(form).length === 0 && Object.keys(settings).length > 0) {
    setForm(settings);
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const updateField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">Joining Letter Settings</h2>
          <p className="text-sm text-muted-foreground">Configure Joining Letter templates for different languages</p>
        </div>
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <div className="flex justify-end mb-4 shrink-0">
        <select 
          className="rounded-md border p-2 text-sm bg-background w-48 shadow-sm"
          value={form.language || "en"}
          onChange={e => updateField("language", e.target.value)}
        >
          <option value="en">🇬🇧 English</option>
        </select>
      </div>

      <div className="space-y-4 flex-1 flex flex-col min-h-0">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Available Placeholders</h3>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: "Date", code: "{date}" },
              { label: "Company Name", code: "{company_name}" },
              { label: "Employee Name", code: "{employee_name}" },
              { label: "Designation", code: "{designation}" },
              { label: "Joining Date", code: "{joining_date}" },
              { label: "Salary", code: "{salary}" },
              { label: "Department", code: "{department}" },
            ].map(ph => (
              <div key={ph.code} className="border rounded-xl p-4 text-left bg-background shadow-sm space-y-2">
                <div className="font-medium text-sm text-foreground">{ph.label}</div>
                <code className="text-[13px] text-blue-500 font-mono">{ph.code}</code>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Template Content</h3>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 flex flex-col border rounded-xl overflow-hidden shadow-sm bg-background">
            <div className="bg-muted/10 border-b p-2 flex items-center gap-1 shrink-0 flex-wrap text-muted-foreground">
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Bold className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Italic className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Strikethrough className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><AlignLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><AlignCenter className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><AlignRight className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><List className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><ListOrdered className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Quote className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Link className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Eraser className="h-4 w-4" /></Button>
              <div className="w-full flex basis-full h-0 m-0"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8 mt-1"><Undo className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8 mt-1"><Redo className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1 mt-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8 mt-1"><Code className="h-4 w-4" /></Button>
            </div>
            <textarea 
              className="flex-1 w-full p-6 resize-none outline-none bg-background font-sans text-sm leading-relaxed"
              value={form.template_content ?? "Joining Letter\nDate: {date}\nDear {employee_name},\nWe are pleased to welcome you to {company_name} as {designation}.\nJoining Date: {joining_date}\nSalary: {salary}\nDepartment: {department}\nWe look forward to your valuable contribution to our company's success.\nBest regards,\nHR Department\n{company_name}"}
              onChange={e => updateField("template_content", e.target.value)}
            />
          </div>
        </div>
      </div>
    </form>
  );
}

function ExperienceCertificateTab() {
  const queryClient = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["settings", "experience_certificate"],
    queryFn: () => getSettings("experience_certificate"),
  });
  
  const mutation = useMutation({
    mutationFn: (payload: Record<string, any>) => updateSettings("experience_certificate", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "experience_certificate"] });
      toast.success("Experience certificate saved.");
    },
    onError: () => toast.error("Failed to save settings."),
  });

  const [form, setForm] = useState<Record<string, any>>({});
  
  if (!isLoading && Object.keys(form).length === 0 && Object.keys(settings).length > 0) {
    setForm(settings);
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const updateField = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">Experience Certificate Settings</h2>
          <p className="text-sm text-muted-foreground">Configure Experience Certificate templates for different languages</p>
        </div>
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <div className="flex justify-end mb-4 shrink-0">
        <select 
          className="rounded-md border p-2 text-sm bg-background w-48 shadow-sm"
          value={form.language || "en"}
          onChange={e => updateField("language", e.target.value)}
        >
          <option value="en">🇬🇧 English</option>
          <option value="es">🇪🇸 Spanish</option>
        </select>
      </div>

      <div className="space-y-4 flex-1 flex flex-col min-h-0">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Available Placeholders</h3>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: "Date", code: "{date}" },
              { label: "Company Name", code: "{company_name}" },
              { label: "Employee Name", code: "{employee_name}" },
              { label: "Designation", code: "{designation}" },
              { label: "Joining Date", code: "{joining_date}" },
              { label: "Leaving Date", code: "{leaving_date}" },
            ].map(ph => (
              <div key={ph.code} className="border rounded-xl p-4 text-left bg-background shadow-sm space-y-2">
                <div className="font-medium text-sm text-foreground">{ph.label}</div>
                <code className="text-[13px] text-blue-500 font-mono">{ph.code}</code>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Template Content</h3>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 flex flex-col border rounded-xl overflow-hidden shadow-sm bg-background">
            <div className="bg-muted/10 border-b p-2 flex items-center gap-1 shrink-0 flex-wrap text-muted-foreground">
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Bold className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Italic className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Strikethrough className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><AlignLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><AlignCenter className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><AlignRight className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><List className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><ListOrdered className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Quote className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Link className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8"><Eraser className="h-4 w-4" /></Button>
              <div className="w-full flex basis-full h-0 m-0"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8 mt-1"><Undo className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8 mt-1"><Redo className="h-4 w-4" /></Button>
              <div className="w-px h-4 bg-border mx-1 mt-1"></div>
              <Button variant="ghost" size="icon" type="button" className="h-8 w-8 mt-1"><Code className="h-4 w-4" /></Button>
            </div>
            <textarea 
              className="flex-1 w-full p-6 resize-none outline-none bg-background font-sans text-sm leading-relaxed"
              value={form.template_content ?? "Experience Certificate\nDate: {date}\nTo Whom It May Concern,\nThis is to certify that {employee_name} was employed with {company_name} as {designation} from {joining_date} to {leaving_date}.\nDuring the period of employment, the above-mentioned employee demonstrated excellent performance and high professional skills. He/She was a dedicated and responsible employee.\nWe wish him/her all the best for future endeavors.\nSincerely,\nHR Department\n{company_name}"}
              onChange={e => updateField("template_content", e.target.value)}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
