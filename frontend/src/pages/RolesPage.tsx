import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Filter, List, LayoutGrid, Eye, Pencil, Trash2, Calendar, Edit3 } from "lucide-react";

import { AppLayout, PageContainer, PageHeader, SectionCard, DataTable } from "@/components/ui-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getRoles, type RoleRead } from "@/services/system";

export function RolesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();
  
  const { data: rolesResponse, isLoading } = useQuery({
    queryKey: ["system_roles"],
    queryFn: getRoles,
  });

  const columns = [
    {
      header: "#",
      accessorKey: "id", // Using index for display
      cell: ({ row }: any) => <span className="text-muted-foreground font-medium">{row.index + 1}</span>,
    },
    {
      header: "Name",
      accessorKey: "name",
      cell: ({ row }: any) => (
        <span className="font-semibold text-foreground">{row.original.name}</span>
      ),
    },
    {
      header: "Permissions",
      accessorKey: "permissions",
      cell: ({ row }: any) => {
        const role = row.original;
        const perms = role.permissions || [];
        const visiblePerms = perms.slice(0, 3);
        const remaining = perms.length - 3;
        
        return (
          <div className="flex flex-wrap gap-1 items-center">
            {visiblePerms.map((perm: any) => (
              <Badge key={perm.code} className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-normal">
                {perm.name}
              </Badge>
            ))}
            {remaining > 0 && (
              <Badge className="bg-muted text-muted-foreground hover:bg-muted font-normal">
                +{remaining} more
              </Badge>
            )}
            {perms.length === 0 && (
              <span className="text-sm text-muted-foreground">No permissions</span>
            )}
          </div>
        );
      },
    },
    {
      header: "Actions",
      accessorKey: "actions",
      cell: ({ row }: any) => {
        const role = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted">
              <Eye className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => navigate(`/system-users/roles/${role.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    }
  ];

  const filteredRoles = rolesResponse?.data.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <AppLayout>
      <PageContainer>
        <div className="flex items-start justify-between mb-6">
          <PageHeader 
            title="Roles" 
            description="Define roles and control permission access." 
          />
        </div>

        <SectionCard className="p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b bg-card">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search..." 
                className="pl-9 bg-card"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <DataTable
            columns={columns}
            data={filteredRoles}
            loading={isLoading}
          />
        </SectionCard>
      </PageContainer>
    </AppLayout>
  );
}
