import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AgentCommandPage } from "@/pages/AgentCommandPage";
import { ApprovalsPage } from "@/pages/ApprovalsPage";
import { AssetsPage } from "@/pages/AssetsPage";
import { AttendancePage } from "@/pages/AttendancePage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";
import { OffersPage } from "@/pages/OffersPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { EmployeeProfilePage } from "@/pages/EmployeeProfilePage";
import { EmployeeViewPage } from "@/pages/EmployeeViewPage";
import { EmployeesPage } from "@/pages/EmployeesPage";
import { LoginPage } from "@/pages/LoginPage";
import { MastersPage } from "@/pages/MastersPage";
import { LeavePage } from "@/pages/LeavePage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { PayrollPage } from "@/pages/PayrollPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { SeatsPage } from "@/pages/SeatsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UnauthorizedPage } from "@/pages/UnauthorizedPage";
import { UsersPage } from "@/pages/UsersPage";
import { RolesPage } from "@/pages/RolesPage";
import { EditRolePage } from "@/pages/EditRolePage";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", element: <LoginPage /> },
  { element: <ProtectedRoute />, children: [{ path: "/unauthorized", element: <UnauthorizedPage /> }] },
  { element: <ProtectedRoute permission="dashboard:view" />, children: [{ path: "/dashboard", element: <DashboardPage /> }] },
  { element: <ProtectedRoute permission="employees:view" />, children: [{ path: "/employees", element: <EmployeesPage /> }] },
  { element: <ProtectedRoute permission="employees:view" />, children: [{ path: "/employees/:id", element: <EmployeeProfilePage /> }] },
  { element: <ProtectedRoute permission="employees:view" />, children: [{ path: "/employees/:id/view", element: <EmployeeViewPage /> }] },
  { element: <ProtectedRoute permission="onboarding:view" />, children: [{ path: "/onboarding", element: <OnboardingPage /> }] },
  { element: <ProtectedRoute permission="employees:view" />, children: [{ path: "/seats", element: <SeatsPage /> }] },
  { element: <ProtectedRoute permission="candidates:view" />, children: [
    { path: "/candidates", element: <PlaceholderPage title="Candidates" /> },
    { path: "/offers", element: <OffersPage /> }
  ] },
  { element: <ProtectedRoute permission="attendance:view" />, children: [{ path: "/attendance", element: <AttendancePage /> }] },
  { element: <ProtectedRoute permission="leave:view" />, children: [{ path: "/leave", element: <LeavePage /> }] },
  { element: <ProtectedRoute permission="payroll:view" />, children: [{ path: "/payroll", element: <PayrollPage /> }] },
  { element: <ProtectedRoute permission="documents:view" />, children: [{ path: "/documents", element: <DocumentsPage /> }] },
  { element: <ProtectedRoute permission="assets:view" />, children: [{ path: "/assets", element: <AssetsPage /> }] },
  { element: <ProtectedRoute permission="offboarding:view" />, children: [{ path: "/offboarding", element: <PlaceholderPage title="Offboarding" /> }] },
  { element: <ProtectedRoute permission="approvals:view" />, children: [{ path: "/approvals", element: <ApprovalsPage /> }] },
  { element: <ProtectedRoute permission="agent_command:view" />, children: [{ path: "/agent-command", element: <AgentCommandPage /> }] },
  { element: <ProtectedRoute permission="audit_logs:view" />, children: [{ path: "/audit-logs", element: <AuditLogsPage /> }] },
  { element: <ProtectedRoute permission="settings:view" />, children: [{ path: "/masters", element: <MastersPage /> }] },
  { element: <ProtectedRoute permission="settings:view" />, children: [{ path: "/settings", element: <SettingsPage /> }] },
  { path: "/system-users", element: <Navigate to="/system-users/users" replace /> },
  { path: "/roles", element: <Navigate to="/system-users/roles" replace /> },
  { element: <ProtectedRoute permission="settings:view" />, children: [{ path: "/system-users/users", element: <UsersPage /> }] },
  { element: <ProtectedRoute permission="settings:view" />, children: [{ path: "/system-users/roles", element: <RolesPage /> }] },
  { element: <ProtectedRoute permission="settings:manage" />, children: [
    { path: "/system-users/roles/:id", element: <Navigate to="edit" replace /> },
    { path: "/system-users/roles/:id/edit", element: <EditRolePage /> }
  ] },
]);