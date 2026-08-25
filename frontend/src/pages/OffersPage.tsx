import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  Plus, 
  Settings2,
  Filter,
  Eye,
  FileEdit,
  MoreVertical,
  LayoutGrid,
  FileText,
  Send,
  CheckCircle2,
  MessageCircle,
  XCircle,
  Clock
} from "lucide-react";
import { format } from "date-fns";

import { AppLayout } from "@/components/ui-system/AppLayout";
import { PageContainer } from "@/components/ui-system/PageContainer";
import { PageHeader } from "@/components/ui-system/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui-system/SectionCard";
import { CreateOfferModal } from "@/components/recruitment/CreateOfferModal";
import { apiGet } from "@/services/api";

type OfferStatus = "Draft" | "Sent" | "Accepted" | "Negotiating" | "Declined" | "Expired";

interface Offer {
  id: string;
  candidate_name: string;
  designation: string;
  salary: number;
  start_date: string;
  expires_at: string;
  offer_date: string;
  status: OfferStatus;
}

export function OffersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<OfferStatus | "All">("All");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: offersData, isLoading } = useQuery<{ data: Offer[], total: number }>({
    queryKey: ["offers"],
    queryFn: () => apiGet<{ data: Offer[], total: number }>("/offers"),
  });

  const offers = offersData?.data || [];

  const filteredOffers = offers.filter(offer => {
    const matchesSearch = offer.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          offer.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "All" || offer.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const getStatusCounts = () => {
    const counts: Record<string, number> = {
      All: offers.length,
      Draft: 0,
      Sent: 0,
      Accepted: 0,
      Negotiating: 0,
      Declined: 0,
      Expired: 0
    };
    offers.forEach(o => {
      if (counts[o.status] !== undefined) counts[o.status]++;
    });
    return counts;
  };
  
  const counts = getStatusCounts();

  const getStatusBadge = (status: OfferStatus) => {
    switch (status) {
      case "Draft":
        return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Draft</span>;
      case "Sent":
        return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">Sent</span>;
      case "Accepted":
        return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Accepted</span>;
      case "Negotiating":
        return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Negotiating</span>;
      case "Declined":
        return <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">Declined</span>;
      case "Expired":
        return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Expired</span>;
    }
  };

  const tabs = [
    { id: "All", label: "All", icon: LayoutGrid, color: "text-emerald-500", bg: "bg-emerald-50" },
    { id: "Draft", label: "Draft", icon: FileText, color: "text-slate-500", bg: "bg-slate-100" },
    { id: "Sent", label: "Sent", icon: Send, color: "text-slate-500", bg: "bg-slate-100" },
    { id: "Accepted", label: "Accepted", icon: CheckCircle2, color: "text-slate-500", bg: "bg-slate-100" },
    { id: "Negotiating", label: "Negotiating", icon: MessageCircle, color: "text-slate-500", bg: "bg-slate-100" },
    { id: "Declined", label: "Declined", icon: XCircle, color: "text-slate-500", bg: "bg-slate-100" },
    { id: "Expired", label: "Expired", icon: Clock, color: "text-slate-500", bg: "bg-slate-100" },
  ];

  return (
    <AppLayout>
      <PageContainer>
      <div className="flex items-start justify-between mb-6">
        <PageHeader 
          title="Offers" 
          description="Manage job offers sent to candidates." 
        />
        <div className="flex items-center gap-3">
          <Button 
            className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create Offer
          </Button>
          <Button variant="outline" size="icon">
            <Settings2 className="h-4 w-4 text-slate-600" />
          </Button>
        </div>
      </div>

      <SectionCard className="p-0 overflow-hidden bg-white border border-slate-200">
        <div className="p-4 border-b">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select className="border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-700 bg-white min-w-[180px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>All Candidates</option>
            </select>
            <div className="flex-1" />
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </div>
        </div>

        <div className="px-4 border-b flex overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as OfferStatus | "All")}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive 
                    ? "border-emerald-500 text-emerald-600" 
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                <tab.icon className={`h-4 w-4 ${isActive ? "text-emerald-500" : "text-slate-400"}`} />
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-xs ${isActive ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {counts[tab.id]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50/50 uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Candidate</th>
                <th className="px-6 py-4">Salary</th>
                <th className="px-6 py-4">Start Date</th>
                <th className="px-6 py-4">Expires</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Offer Date</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-500">Loading offers...</td></tr>
              ) : filteredOffers.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-500">No offers found matching criteria.</td></tr>
              ) : (
                filteredOffers.map((offer, index) => {
                  const isExpired = offer.status === "Expired";
                  const initial = offer.candidate_name.split(' ').map(n => n[0]).join('').substring(0, 2);
                  
                  return (
                    <tr key={offer.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-slate-500 font-medium">{index + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 text-xs font-semibold overflow-hidden">
                            {initial}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{offer.candidate_name}</p>
                            <p className="text-xs text-slate-500">{offer.designation}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        ${offer.salary.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-600">
                          <CalendarIcon className="h-4 w-4 text-slate-400" />
                          {offer.start_date}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`flex flex-col gap-1 ${isExpired ? 'text-rose-600' : 'text-slate-600'}`}>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            {offer.expires_at}
                          </div>
                          {isExpired && <span className="text-xs font-medium">Expired</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(offer.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-600">
                          <CalendarIcon className="h-4 w-4 text-slate-400" />
                          {offer.offer_date}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
                            <FileEdit className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      
      <CreateOfferModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
      />
    </PageContainer>
    </AppLayout>
  );
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  )
}
