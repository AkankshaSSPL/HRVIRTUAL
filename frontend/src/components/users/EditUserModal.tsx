import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { updateUser, getRoles, type UserRead } from "@/services/system";

export function EditUserModal({
  user,
  open,
  onClose,
}: {
  user: UserRead | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const { data: rolesResponse } = useQuery({
    queryKey: ["system_roles"],
    queryFn: getRoles,
  });

  useEffect(() => {
    if (user) {
      setName(user.full_name || `${user.first_name} ${user.last_name}`);
      setEmail(user.email);
      setSelectedRoles(user.roles || []);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      
      // Simple logic to parse name
      const parts = name.trim().split(" ");
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      
      return updateUser(user.id, {
        first_name: firstName,
        last_name: lastName,
        email: email,
        roles: selectedRoles,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_users"] });
      onClose();
    },
    onError: (err: any) => {
      alert(err.message || "Failed to update user");
    },
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white p-0 shadow-xl border-slate-100">
        <DialogHeader className="px-6 py-5 border-b bg-slate-50/50">
          <DialogTitle className="text-xl text-slate-800">Edit User</DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Name <span className="text-red-500">*</span></label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Enter name"
              className="bg-white border-slate-200 focus-visible:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Email <span className="text-red-500">*</span></label>
            <Input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="Enter email address"
              type="email"
              className="bg-white border-slate-200 focus-visible:ring-emerald-500"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Roles <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg max-h-[160px] overflow-y-auto">
              {(rolesResponse?.data || []).map((r) => {
                const isSelected = selectedRoles.includes(r.name);
                return (
                  <div 
                    key={r.id} 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedRoles(prev => prev.filter(roleName => roleName !== r.name));
                      } else {
                        setSelectedRoles(prev => [...prev, r.name]);
                      }
                    }}
                  >
                    <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm text-slate-700">{r.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        <DialogFooter className="px-6 py-4 border-t bg-slate-50/50 flex sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="bg-white hover:bg-slate-50 text-slate-700 border-slate-200">
            Cancel
          </Button>
          <Button 
            onClick={() => mutation.mutate()} 
            disabled={mutation.isPending || !name || !email || selectedRoles.length === 0}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
