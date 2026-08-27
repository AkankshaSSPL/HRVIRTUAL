import { useState, useRef, useEffect } from "react";
import { LogOut, User as UserIcon, ChevronDown, Globe } from "lucide-react";

import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";

interface UserDropdownProps {
  onLogout: () => void;
  onProfile: () => void;
}

export function UserDropdown({ onLogout, onProfile }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayType = user?.employment_type 
    ? user.employment_type.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
    : (user?.roles?.[0] || "");

  return (
    <div className="flex items-center gap-4">

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent transition-colors focus:outline-none"
        >
          <div className="flex h-10 w-10 overflow-hidden items-center justify-center rounded-full bg-secondary text-secondary-foreground">
             {/* If we had an avatar URL we could show it here, fallback to icon */}
            <UserIcon className="h-6 w-6" />
          </div>
          <div className="hidden flex-col items-start text-sm sm:flex">
            <span className="font-semibold text-foreground leading-none">
              {user?.full_name ?? ""} 
              {displayType ? <span className="font-normal text-muted-foreground ml-1">({displayType})</span> : ""}
            </span>
            <span className="text-xs text-muted-foreground mt-1">{user?.email ?? ""}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-1 hidden sm:block" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-card text-card-foreground shadow-lg ring-1 ring-border focus:outline-none z-50">
            <div className="border-b px-4 py-3 sm:hidden">
              <p className="text-sm font-medium text-foreground truncate">{user?.full_name ?? ""}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email ?? ""}</p>
            </div>
            
            {/* Header info in dropdown (from screenshot) */}
            <div className="border-b px-4 py-3 hidden sm:block">
              <p className="text-sm font-semibold text-foreground">
                {user?.full_name ?? ""}
                {displayType ? <span className="font-normal text-muted-foreground ml-1">({displayType})</span> : ""}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email ?? ""}</p>
            </div>

            <div className="py-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onProfile();
                }}
                className="flex w-full items-center px-4 py-2 text-sm hover:bg-accent"
              >
                <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                Profile
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center px-4 py-2 text-sm hover:bg-accent"
              >
                <LogOut className="mr-3 h-4 w-4 text-muted-foreground" />
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
