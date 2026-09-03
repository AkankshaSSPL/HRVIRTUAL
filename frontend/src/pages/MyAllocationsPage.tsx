import { useQuery } from "@tanstack/react-query";
import { Laptop, MapPin, Monitor, Smartphone, Keyboard, Mouse, Cpu, Package } from "lucide-react";
import { AppLayout, PageContainer, PageHeader } from "@/components/ui-system";
import { apiGet } from "@/services/api";

type EmployeeStats = {
  seat_label?: string;
  assets?: {
    asset_type: string;
    asset_name: string;
    asset_code: string;
  }[];
};

const getAssetIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('laptop')) return <Laptop className="w-5 h-5 text-indigo-500" />;
  if (t.includes('monitor')) return <Monitor className="w-5 h-5 text-blue-500" />;
  if (t.includes('phone') || t.includes('mobile')) return <Smartphone className="w-5 h-5 text-purple-500" />;
  if (t.includes('keyboard')) return <Keyboard className="w-5 h-5 text-emerald-500" />;
  if (t.includes('mouse')) return <Mouse className="w-5 h-5 text-rose-500" />;
  return <Cpu className="w-5 h-5 text-amber-500" />;
};

export function MyAllocationsPage() {
  const statsQuery = useQuery({
    queryKey: ["employee-stats"],
    queryFn: () => apiGet<EmployeeStats>("/dashboard/employee-stats"),
  });

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title="My Allocations"
          description="View the assets and seating currently assigned to you."
        />

        <div className="mt-6 grid gap-6 md:grid-cols-12 items-start">
          {/* Seat Allocation Card */}
          <div className="md:col-span-4 bg-white dark:bg-card border shadow-sm rounded-xl overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 px-5 py-4 border-b flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-semibold text-foreground">Assigned Seat</h3>
            </div>
            
            <div className="p-5 flex flex-col justify-center items-center text-center">
              {statsQuery.isSuccess ? (
                statsQuery.data.seat_label ? (
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full scale-125 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50 shadow-lg shadow-emerald-500/5 rounded-xl p-6 flex flex-col items-center gap-3 transform group-hover:-translate-y-1 transition-all duration-300">
                      <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center border border-emerald-100 dark:border-emerald-800">
                        <MapPin className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">Workstation</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{statsQuery.data.seat_label}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-muted-foreground">
                    <MapPin className="w-8 h-8 mb-3 opacity-20" />
                    <p className="text-sm italic">No seat assigned.</p>
                  </div>
                )
              ) : (
                <div className="w-full h-32 rounded-xl bg-muted animate-pulse"></div>
              )}
            </div>
          </div>

          {/* Assets Allocation Card */}
          <div className="md:col-span-8 bg-white dark:bg-card border shadow-sm rounded-xl overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-500/10 to-blue-500/5 px-5 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <Laptop className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-semibold text-foreground">Assigned Assets</h3>
              </div>
              {statsQuery.isSuccess && statsQuery.data.assets && (
                <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-md">
                  {statsQuery.data.assets.length} Items
                </span>
              )}
            </div>
            
            <div className="p-4">
              {statsQuery.isSuccess ? (
                statsQuery.data.assets && statsQuery.data.assets.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {statsQuery.data.assets.map((asset, i) => (
                      <div 
                        key={i} 
                        className="group flex items-center justify-between rounded-md border border-border px-3 py-2 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all overflow-hidden relative"
                      >
                        <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-bl-full -mr-6 -mt-6 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        
                        <div className="flex items-center gap-2.5 relative z-10 overflow-hidden">
                          <div className="p-1.5 bg-white dark:bg-slate-950 rounded-md border shadow-sm shrink-0">
                            {getAssetIcon(asset.asset_type)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight truncate">{asset.asset_name || asset.asset_type}</p>
                            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5 truncate">{asset.asset_type}</p>
                          </div>
                        </div>
                        
                        <div className="relative z-10 shrink-0 ml-3">
                          <span className="text-[10px] font-mono font-semibold bg-white dark:bg-slate-950 border px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 shadow-sm">
                            {asset.asset_code}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
                    <Package className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm italic">No assets assigned.</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-[60px] rounded-lg bg-muted animate-pulse"></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
