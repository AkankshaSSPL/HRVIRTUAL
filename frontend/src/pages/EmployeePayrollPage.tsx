import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Eye, Filter, CheckCircle2, FileText, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout, LoadingSkeleton, PageContainer, StatusBadge, DataTable } from "@/components/ui-system";
import { getMyPayslips, MyPayslipSummary } from "@/services/payroll";
import { SalarySlipModal } from "@/components/payroll/SalarySlipModal";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function EmployeePayrollPage() {
  const [viewingSlipId, setViewingSlipId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "generated" | "downloaded">("all");

  const { user } = useAuthStore();

  const payslipsQuery = useQuery({
    queryKey: ["my-payslips"],
    queryFn: getMyPayslips,
  });

  const payslips = payslipsQuery.data ?? [];

  // Filter payslips based on UI state
  const filteredPayslips = useMemo(() => {
    return payslips.filter(slip => {
      if (slip.year !== selectedYear) return false;
      
      // We'll let the user see all slips for the year if they don't explicitly filter by month via the ribbon,
      // Wait, the screenshot shows "Aug 2026" selected in the ribbon, and the table below shows "Showing 1 to 1 of 1 results".
      // Let's filter by the selected month in the ribbon too.
      if (slip.month !== selectedMonth) return false;

      // Filter by active tab
      if (activeTab === "generated" && slip.status !== "Generated") return false;
      if (activeTab === "downloaded" && slip.status !== "Downloaded") return false;

      // Filter by search query (e.g. employee name, but it's just me)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!user?.full_name.toLowerCase().includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [payslips, selectedYear, selectedMonth, activeTab, searchQuery, user]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // Status counts for tabs
  const counts = useMemo(() => {
    const monthSlips = payslips.filter(s => s.year === selectedYear && s.month === selectedMonth);
    return {
      all: monthSlips.length,
      generated: monthSlips.filter(s => s.status === "Generated").length,
      downloaded: monthSlips.filter(s => s.status === "Downloaded").length,
    };
  }, [payslips, selectedYear, selectedMonth]);

  const columns = [
    {
      accessorKey: "id",
      header: "#",
      cell: ({ row }: any) => <span className="font-medium">{row.index + 1}</span>,
    },
    {
      accessorKey: "employee",
      header: "Employee",
      cell: () => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase">
            {user?.full_name?.[0] || "E"}
          </div>
          <div>
            <div className="font-semibold">{user?.full_name}</div>
            <div className="text-xs text-muted-foreground">EMP6816</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "pay_date",
      header: "Pay Date",
      cell: ({ row }: { row: { original: MyPayslipSummary } }) => (
        <div className="flex items-center text-sm font-medium">
          <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
          {format(new Date(row.original.year, row.original.month, 5), "yyyy-MM-dd")}
        </div>
      ),
    },
    {
      accessorKey: "net_salary",
      header: "Net Pay",
      cell: ({ row }: { row: { original: MyPayslipSummary } }) => (
        <span className="font-semibold">
          ${row.original.net_salary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: MyPayslipSummary } }) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
          {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: "generated_on",
      header: "Generated On",
      cell: ({ row }: { row: { original: MyPayslipSummary } }) => (
        <div className="flex items-center text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4 mr-2" />
          {row.original.generated_on || "N/A"}
        </div>
      ),
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }: { row: { original: MyPayslipSummary } }) => (
        <Button variant="ghost" size="icon" onClick={() => setViewingSlipId(row.original.run_id)} className="text-muted-foreground hover:text-foreground">
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageContainer>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Payslips</h1>
          <p className="text-muted-foreground">Browse and download employee payslips.</p>
        </div>

        {/* Month Ribbon */}
        <div className="flex bg-card border rounded-lg mb-6 shadow-sm overflow-hidden">
          {MONTH_NAMES.map((month, index) => {
            const isSelected = selectedMonth === index + 1;
            return (
              <button
                key={month}
                onClick={() => setSelectedMonth(index + 1)}
                className={`flex-1 py-4 text-center text-sm font-medium transition-colors border-r last:border-r-0 ${
                  isSelected ? "bg-[#10b981] text-white" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div>{month}</div>
                {isSelected && <div className="text-xs opacity-80 mt-0.5">{selectedYear}</div>}
              </button>
            );
          })}
        </div>

        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b bg-muted/10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-[240px] h-9 bg-background"
                  />
                </div>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>

              </div>
              <Button variant="outline" size="sm" className="h-9 bg-background">
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center px-4 border-b bg-muted/10">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === "all" ? "border-[#10b981] text-[#10b981]" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="grid grid-cols-2 gap-[2px]">
                  <div className={`w-1.5 h-1.5 rounded-sm ${activeTab === "all" ? "bg-[#10b981]" : "bg-muted-foreground"}`} />
                  <div className={`w-1.5 h-1.5 rounded-sm ${activeTab === "all" ? "bg-[#10b981]" : "bg-muted-foreground"}`} />
                  <div className={`w-1.5 h-1.5 rounded-sm ${activeTab === "all" ? "bg-[#10b981]" : "bg-muted-foreground"}`} />
                  <div className={`w-1.5 h-1.5 rounded-sm ${activeTab === "all" ? "bg-[#10b981]" : "bg-muted-foreground"}`} />
                </div>
                All
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${activeTab === "all" ? "bg-[#10b981] text-white" : "bg-muted text-muted-foreground"}`}>
                {counts.all}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("generated")}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === "generated" ? "border-[#10b981] text-[#10b981]" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Generated
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${activeTab === "generated" ? "bg-gray-100 text-gray-600" : "bg-muted text-muted-foreground"}`}>
                {counts.generated}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("downloaded")}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === "downloaded" ? "border-[#10b981] text-[#10b981]" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Downloaded
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${activeTab === "downloaded" ? "bg-gray-100 text-gray-600" : "bg-muted text-muted-foreground"}`}>
                {counts.downloaded}
              </span>
            </button>
          </div>

          {/* Data Table */}
          <div>
            {payslipsQuery.isLoading ? (
              <div className="p-4"><LoadingSkeleton rows={3} /></div>
            ) : (
              <DataTable
                data={filteredPayslips}
                columns={columns}
                getRowId={(row) => row.run_id}
                hideToolbar={true}
              />
            )}
          </div>
        </div>

        <SalarySlipModal
          runId={viewingSlipId}
          employeeId="me"
          onClose={() => setViewingSlipId(null)}
        />
      </PageContainer>
    </AppLayout>
  );
}
