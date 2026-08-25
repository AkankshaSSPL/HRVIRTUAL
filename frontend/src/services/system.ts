import { apiGet, apiPatch, apiPut } from "./api";

export interface UserRead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  roles: string[];
  created_at: string;
  face_registered: boolean;
  full_name: string;
}

export interface UserListResponse {
  data: UserRead[];
  total: number;
}

export interface PermissionRead {
  code: string;
  name: string;
}

export interface RoleRead {
  id: string;
  name: string;
  permissions: PermissionRead[];
}

export interface RoleUpdateRequest {
  permissions: string[];
}

export interface RoleListResponse {
  data: RoleRead[];
  total: number;
}

export async function getUsers(): Promise<UserListResponse> {
  const res = await apiGet<UserListResponse>("/users");
  return res;
}

export async function updateUser(userId: string, data: Partial<UserRead>): Promise<UserRead> {
  return await apiPatch<UserRead>(`/users/${userId}`, data);
}

export async function getRoles(): Promise<RoleListResponse> {
  const res = await apiGet<RoleListResponse>("/roles");
  return res;
}

export async function getRole(id: string): Promise<RoleRead> {
  return await apiGet<RoleRead>(`/roles/${id}`);
}

export async function updateRole(id: string, data: RoleUpdateRequest): Promise<RoleRead> {
  return await apiPut<RoleRead>(`/roles/${id}`, data);
}

export async function getPermissions(): Promise<PermissionRead[]> {
  return await apiGet<PermissionRead[]>("/roles/permissions");
}
