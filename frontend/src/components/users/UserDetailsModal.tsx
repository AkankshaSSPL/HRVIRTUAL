import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Calendar, Shield, Activity, User as UserIcon } from "lucide-react";
import type { UserRead } from "@/services/system";

export function UserDetailsModal({
  user,
  open,
  onClose,
}: {
  user: UserRead | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!user) return null;

  const validDate = user.created_at ? new Date(user.created_at) : null;
  const joinedDate = validDate && !isNaN(validDate.getTime()) 
    ? validDate.toISOString().split("T")[0] 
    : "N/A";

  const fullName = user.full_name || `${user.first_name} ${user.last_name}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-white p-0 overflow-hidden shadow-xl border-slate-100">
        <DialogHeader className="px-6 py-5 border-b bg-slate-50/50">
          <DialogTitle className="flex items-center gap-3 text-xl text-slate-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserIcon className="h-5 w-5" />
            </div>
            User Details
          </DialogTitle>
        </DialogHeader>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-x-12 gap-y-10">
            {/* Name */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                <User className="h-4 w-4" />
                Name
              </div>
              <p className="text-slate-900 font-medium text-base">
                {fullName}
              </p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                <Mail className="h-4 w-4" />
                Email
              </div>
              <p className="text-slate-900 font-medium text-base">
                {user.email}
              </p>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                <Activity className="h-4 w-4" />
                Status
              </div>
              <div>
                <Badge
                  className={
                    user.is_active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }
                >
                  {user.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>

            {/* Joined */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                Joined
              </div>
              <p className="text-slate-900 font-medium text-base">
                {joinedDate}
              </p>
            </div>

            {/* Roles */}
            <div className="space-y-3 col-span-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                <Shield className="h-4 w-4" />
                Roles
              </div>
              <div className="flex flex-wrap gap-2">
                {(user.roles || []).length > 0 ? (
                  user.roles.map((role) => (
                    <Badge
                      key={role}
                      className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-normal px-3 py-1"
                    >
                      {role}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-400 italic">No roles</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
