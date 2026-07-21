import { CheckCircle2, Info, XCircle } from "lucide-react";

const icons = {
  success: CheckCircle2,
  info: Info,
  error: XCircle,
};

type ToastNotificationProps = {
  title: string;
  description?: string;
  type?: keyof typeof icons;
};

export function ToastNotification({ title, description, type = "info" }: ToastNotificationProps) {
  const Icon = icons[type];
  return (
    <div className="flex max-w-sm gap-3 rounded-lg border bg-card p-4 shadow-soft">
      <Icon className="mt-0.5 h-5 w-5 text-primary" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

