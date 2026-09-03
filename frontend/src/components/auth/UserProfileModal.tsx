import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { FaceBiometricTab } from "@/components/employees/FaceBiometricTab";
import { User, Lock, Camera, Eye, EyeOff } from "lucide-react";

function PasswordInput({ label, placeholder }: { label: string; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
      <div className="relative">
        <Input type={show ? "text" : "password"} placeholder={placeholder} className="pr-10" />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

interface UserProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserProfileModal({ open, onOpenChange }: UserProfileModalProps) {
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<"profile" | "password">("profile");

  if (!user) return null;

  const isSuperAdmin = user?.is_superuser;
  const isHR = user?.roles?.includes("HR");
  const isEmployeeOnly = user?.roles?.includes("Employee") && !isSuperAdmin && !isHR;

  const handleSave = () => {
    alert("Settings saved successfully.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-background p-6 sm:p-10 max-h-[90vh] overflow-y-auto border-border">
        <div className="flex items-center justify-between mb-2">
          <DialogTitle className="text-2xl font-semibold">Profile Settings</DialogTitle>
        </div>
        
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 space-y-2 shrink-0">
            <div className="bg-card rounded-xl border border-border p-2 shadow-sm space-y-1">
              <button
                onClick={() => setActiveTab("profile")}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "profile" 
                    ? "bg-accent text-accent-foreground" 
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <User className="w-4 h-4" />
                Profile
              </button>
              {!isEmployeeOnly && (
                <button
                  onClick={() => setActiveTab("password")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === "password" 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  Password
                </button>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-8">
            {activeTab === "profile" && (
              <>
                <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-sm">
                  <h3 className="text-lg font-semibold text-foreground mb-1">Profile Information</h3>
                  <p className="text-sm text-muted-foreground mb-6">Update your account's profile information and email address</p>
                  
                  <div className="flex items-center gap-6 mb-8">
                    <div className="h-20 w-20 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center text-muted-foreground">
                      {/* Placeholder for avatar, could add real image if URL is available */}
                      <User className="h-10 w-10" />
                    </div>
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Camera className="w-4 h-4" />
                        Change Avatar
                      </Button>
                      <p className="text-xs text-muted-foreground font-medium">JPG, PNG, GIF up to 2MB</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">Name</label>
                      <Input defaultValue={user.full_name} placeholder="Company" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">Email address</label>
                      <Input defaultValue={user.email} placeholder="company@example.com" />
                    </div>
                    <div className="pt-2">
                      <Button className="bg-primary hover:bg-primary/90 text-primary-foreground border-0" onClick={handleSave}>Save</Button>
                    </div>
                  </div>
                </div>

                {/* Face Biometric Section */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">Face Biometric Setup</h3>
                  <div className="bg-card rounded-xl border border-border shadow-sm">
                    <FaceBiometricTab userId={user.id} />
                  </div>
                </div>
              </>
            )}

            {!isEmployeeOnly && activeTab === "password" && (
              <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-sm">
                <h3 className="text-lg font-semibold text-foreground mb-1">Update Password</h3>
                <p className="text-sm text-muted-foreground mb-6">Ensure your account is using a long, random password to stay secure</p>
                
                <div className="space-y-5">
                  <PasswordInput label="Current password" placeholder="Current password" />
                  <PasswordInput label="New password" placeholder="New password" />
                  <PasswordInput label="Confirm password" placeholder="Confirm password" />
                  <div className="pt-2">
                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground border-0" onClick={handleSave}>Save</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
