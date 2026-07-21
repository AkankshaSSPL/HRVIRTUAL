import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LoadingSkeleton } from "@/components/ui-system";
import { useAuthStore } from "@/stores/authStore";

type ProtectedRouteProps = {
  permission?: string;
};

export function ProtectedRoute({ permission }: ProtectedRouteProps) {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="min-h-screen bg-background p-8">
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

