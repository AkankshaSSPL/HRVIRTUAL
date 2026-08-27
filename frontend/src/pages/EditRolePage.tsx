import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckSquare, Square } from "lucide-react";
import { toast } from "react-hot-toast";

import { AppLayout, PageContainer, PageHeader, SectionCard } from "@/components/ui-system";
import { Button } from "@/components/ui/button";
import { getRole, getPermissions, updateRole, RoleRead, PermissionRead } from "@/services/system";

export function EditRolePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  // Fetch role
  const { data: role, isLoading: isRoleLoading } = useQuery<RoleRead>({
    queryKey: ["roles", id],
    queryFn: () => getRole(id as string),
    enabled: !!id,
  });

  // Fetch all permissions
  const { data: allPermissions, isLoading: isPermsLoading } = useQuery<PermissionRead[]>({
    queryKey: ["permissions"],
    queryFn: getPermissions,
  });

  // Initialize selected perms
  useEffect(() => {
    if (role && role.permissions) {
      setSelectedPerms(new Set(role.permissions.map(p => p.code)));
    }
  }, [role]);

  const updateMutation = useMutation({
    mutationFn: (perms: string[]) => updateRole(id as string, { permissions: perms }),
    onSuccess: () => {
      toast.success("Role permissions updated successfully");
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      navigate("/system-users/roles");
    },
    onError: () => {
      toast.error("Failed to update permissions");
    }
  });

  // Group permissions by module
  const modules = useMemo(() => {
    if (!allPermissions) return [];
    
    const groups: Record<string, PermissionRead[]> = {};
    allPermissions.forEach(perm => {
      const moduleName = perm.code.split(":")[0];
      // Capitalize
      const cleanName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
      const finalName = cleanName.replace(/_/g, " ");
      
      if (!groups[finalName]) {
        groups[finalName] = [];
      }
      groups[finalName].push(perm);
    });
    
    // Convert to array of objects
    return Object.entries(groups).map(([name, perms]) => ({
      name,
      perms
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allPermissions]);

  if (isRoleLoading || isPermsLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
        </PageContainer>
      </AppLayout>
    );
  }

  if (!role) {
    return (
      <AppLayout>
        <PageContainer>
          <div className="flex items-center justify-center h-64 text-muted-foreground">Role not found</div>
        </PageContainer>
      </AppLayout>
    );
  }

  const togglePermission = (code: string) => {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleModule = (modulePerms: PermissionRead[]) => {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      const allSelected = modulePerms.every(p => next.has(p.code));
      
      if (allSelected) {
        modulePerms.forEach(p => next.delete(p.code));
      } else {
        modulePerms.forEach(p => next.add(p.code));
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!allPermissions) return;
    
    if (selectedPerms.size === allPermissions.length) {
      setSelectedPerms(new Set());
    } else {
      setSelectedPerms(new Set(allPermissions.map(p => p.code)));
    }
  };

  const handleSave = () => {
    updateMutation.mutate(Array.from(selectedPerms));
  };

  const CheckboxIcon = ({ checked }: { checked: boolean }) => {
    if (checked) return <CheckSquare className="h-5 w-5 shrink-0 text-emerald-500 fill-emerald-50" />;
    return <Square className="h-5 w-5 shrink-0 text-emerald-500" />;
  };

  return (
    <AppLayout>
      <PageContainer>
        <div className="flex items-start justify-between mb-6">
          <PageHeader 
            title="Edit Role" 
            description="Update role name and permission assignments." 
          />
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => navigate("/system-users/roles")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="space-y-6">
          {/* Role Information Card */}
          <SectionCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-1">Role Information</h3>
            <p className="text-sm text-muted-foreground mb-6">Update the role name and description.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <div className="px-3 py-2 bg-muted/50 border border-border rounded-md text-muted-foreground cursor-not-allowed">
                  {role.name}
                </div>
                <p className="text-xs text-amber-600 mt-2">This role name cannot be changed.</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Description
                </label>
                <div className="px-3 py-2 bg-muted/50 border border-border rounded-md text-muted-foreground h-24 cursor-not-allowed">
                  {role.name} Role
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Role Permissions Card */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-1">Role Permissions</h3>
            <p className="text-sm text-muted-foreground mb-1">Select permissions for this role. You can select all permissions at once or manage them by module.</p>
            <p className="text-xs text-amber-600 mb-6">Note: Only permissions for modules available to your role are shown.</p>

            {/* Select All */}
            <div 
              className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border mb-6 cursor-pointer hover:bg-muted transition-colors"
              onClick={toggleAll}
            >
              <div className="flex items-center gap-3">
                <CheckboxIcon checked={allPermissions ? selectedPerms.size === allPermissions.length : false} />
                <span className="font-medium text-foreground">Select All Permissions</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {selectedPerms.size} of {allPermissions?.length || 0} selected
              </span>
            </div>

            {/* Modules List */}
            <div className="space-y-4">
              {modules.map(module => {
                const moduleSelectedCount = module.perms.filter(p => selectedPerms.has(p.code)).length;
                const isAllSelected = moduleSelectedCount === module.perms.length;

                return (
                  <div key={module.name} className="border border-border rounded-lg overflow-hidden">
                    <div 
                      className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                        isAllSelected ? "bg-emerald-50 border-b border-emerald-100" : "bg-muted/50 border-b border-border hover:bg-muted"
                      }`}
                      onClick={() => toggleModule(module.perms)}
                    >
                      <div className="flex items-center gap-3">
                        <CheckboxIcon checked={isAllSelected} />
                        <span className="font-medium text-foreground">{module.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {moduleSelectedCount} of {module.perms.length} selected
                      </span>
                    </div>
                    
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {module.perms.map(perm => (
                        <div 
                          key={perm.code}
                          className="flex items-center gap-3 cursor-pointer"
                          onClick={() => togglePermission(perm.code)}
                        >
                          <CheckboxIcon checked={selectedPerms.has(perm.code)} />
                          <span className="text-sm text-muted-foreground select-none">
                            {perm.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <Button 
                onClick={handleSave} 
                disabled={updateMutation.isPending}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
