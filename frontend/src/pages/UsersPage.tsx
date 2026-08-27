import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  History, Plus, Search, Filter, List, LayoutGrid, 
  Eye, Pencil, Key, Lock, Trash2, Calendar, User as UserIcon
} from "lucide-react";

import { AppLayout, PageContainer, PageHeader, SectionCard, DataTable } from "@/components/ui-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getUsers, type UserRead } from "@/services/system";
import { EditUserModal } from "@/components/users/EditUserModal";
import { UserDetailsModal } from "@/components/users/UserDetailsModal";

export function UsersPage() {
  const [selectedUser, setSelectedUser] = useState<UserRead | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  
  const { data: usersResponse, isLoading } = useQuery({
    queryKey: ["system_users"],
    queryFn: getUsers,
  });

  const columns = [
    {
      header: "#",
      accessorKey: "id", // Just using index instead of id for display
      cell: ({ row }: any) => <span className="text-muted-foreground font-medium">{row.index + 1}</span>,
    },
    {
      header: "Name",
      id: "name",
      accessorFn: (row: any) => row.full_name || `${row.first_name} ${row.last_name}`,
      cell: ({ row }: any) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0 border border-border">
              {/* If we had face embedding or real images, we'd render them. Fallback to icon */}
              <UserIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">{user.full_name || `${user.first_name} ${user.last_name}`}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      header: "Roles",
      accessorKey: "roles",
      cell: ({ row }: any) => {
        const user = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            {(user.roles || []).length > 0 ? (user.roles || []).map((role: string) => (
              <Badge key={role} className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-normal">
                {role}
              </Badge>
            )) : <span className="text-sm text-muted-foreground">No roles</span>}
          </div>
        );
      },
    },
    {
      header: "Joined",
      accessorKey: "created_at",
      cell: ({ row }: any) => {
        const user = row.original;
        const dateStr = user.created_at;
        const validDate = dateStr ? new Date(dateStr) : null;
        const displayDate = validDate && !isNaN(validDate.getTime()) 
          ? validDate.toISOString().split('T')[0] 
          : "N/A";
          
        return (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {displayDate}
          </div>
        );
      },
    },
    {
      header: "Actions",
      accessorKey: "actions",
      cell: ({ row }: any) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => {
                setSelectedUser(user);
                setDetailsModalOpen(true);
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => {
                setSelectedUser(user);
                setEditModalOpen(true);
              }}
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

  const users = usersResponse?.data || [];
  const filteredUsers = roleFilter === "All Roles" 
    ? users 
    : users.filter(u => (u.roles || []).includes(roleFilter));

  return (
    <AppLayout>
      <PageContainer>
        <div className="flex items-start justify-between mb-6">
          <PageHeader 
            title="Users Management" 
            description="Manage system users and their account access." 
          />
          <div className="flex items-center gap-3">
          </div>
        </div>

        <SectionCard className="p-0 overflow-hidden">
          <DataTable
            columns={columns}
            data={filteredUsers}
            loading={isLoading}
            actions={
              <>
                <select 
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="All Roles">All Roles</option>
                  <option value="Super Admin">Super Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="HR">HR</option>
                  <option value="Employee">Employee</option>
                </select>
                <div className="flex items-center border rounded-md p-0.5 bg-muted/50">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-7 w-7 rounded-sm ${viewMode === 'list' ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white' : 'text-muted-foreground hover:bg-muted'}`}
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-7 w-7 rounded-sm ${viewMode === 'grid' ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white' : 'text-muted-foreground hover:bg-muted'}`}
                    onClick={() => {
                       setViewMode('grid');
                       // Grid view implementation can be added here later
                    }}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </>
            }
          />
        </SectionCard>
      </PageContainer>
      
      <UserDetailsModal 
        user={selectedUser} 
        open={detailsModalOpen} 
        onClose={() => setDetailsModalOpen(false)} 
      />
      <EditUserModal 
        user={selectedUser} 
        open={editModalOpen} 
        onClose={() => setEditModalOpen(false)} 
      />
    </AppLayout>
  );
}
