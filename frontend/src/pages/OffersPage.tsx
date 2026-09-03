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
  Clock,
  Trash2,
  ArrowLeft,
  User,
  Briefcase,
  Building,
  IndianRupee,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

import { AppLayout } from "@/components/ui-system/AppLayout";
import { PageContainer } from "@/components/ui-system/PageContainer";
import { PageHeader } from "@/components/ui-system/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui-system/SectionCard";
import { ConfirmDialog } from "@/components/ui-system/ConfirmDialog";
import { CreateOfferModal } from "@/components/recruitment/CreateOfferModal";
import { apiGet } from "@/services/api";
import { startOnboarding } from "@/services/candidates";
import { updateOfferStatus, deleteOffer, sendOffer } from "@/services/offers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

type OfferStatus = "Draft" | "Sent" | "Accepted" | "Negotiating" | "Declined" | "Expired";

interface Offer {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_status: string;
  designation: string;
  salary: number;
  start_date: string;
  expires_at: string;
  offer_date: string;
  status: OfferStatus;
}

export function OffersPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<OfferStatus | "All">("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [offerToDelete, setOfferToDelete] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);

  const { data: offersData, isLoading } = useQuery<{ data: Offer[], total: number }>({
    queryKey: ["offers"],
    queryFn: () => apiGet<{ data: Offer[], total: number }>("/offers"),
  });

  const onboardingMutation = useMutation({
    mutationFn: startOnboarding,
    onSuccess: () => {
      toast.success("Onboarding started for candidate!");
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to start onboarding");
    },
  });

  const sendOfferMutation = useMutation({
    mutationFn: (offerId: string) => sendOffer(offerId),
    onSuccess: () => {
      toast.success("Offer email sent successfully to candidate!");
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send offer email");
    },
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (offerId: string) => updateOfferStatus(offerId, "Accepted"),
    onSuccess: () => {
      toast.success("Offer marked as Accepted!");
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update offer status");
    },
  });

  const rejectOfferMutation = useMutation({
    mutationFn: (offerId: string) => updateOfferStatus(offerId, "Declined"),
    onSuccess: () => {
      toast.success("Offer marked as Declined!");
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update offer status");
    },
  });

  const deleteOfferMutation = useMutation({
    mutationFn: deleteOffer,
    onSuccess: () => {
      toast.success("Offer deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      setOfferToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete offer");
    },
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
        return <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Draft</span>;
      case "Sent":
        return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">Sent</span>;
      case "Accepted":
        return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Accepted</span>;
      case "Negotiating":
        return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Negotiating</span>;
      case "Declined":
        return <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">Declined</span>;
      case "Expired":
        return <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Expired</span>;
    }
  };

  const tabs = [
    { id: "All", label: "All", icon: LayoutGrid, color: "text-emerald-500", bg: "bg-emerald-50" },
    { id: "Draft", label: "Draft", icon: FileText, color: "text-muted-foreground", bg: "bg-muted" },
    { id: "Sent", label: "Sent", icon: Send, color: "text-muted-foreground", bg: "bg-muted" },
    { id: "Accepted", label: "Accepted", icon: CheckCircle2, color: "text-muted-foreground", bg: "bg-muted" },
    { id: "Negotiating", label: "Negotiating", icon: MessageCircle, color: "text-muted-foreground", bg: "bg-muted" },
    { id: "Declined", label: "Declined", icon: XCircle, color: "text-muted-foreground", bg: "bg-muted" },
    { id: "Expired", label: "Expired", icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
  ];

  if (selectedOffer) {
    return (
      <AppLayout>
        <PageContainer>
          <div className="flex justify-between items-start mb-6">
            <PageHeader 
              title="Offer Details" 
              description="View the full details and status of this job offer." 
            />
            <Button variant="outline" onClick={() => setSelectedOffer(null)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>
          
          <div className="bg-card rounded-xl border shadow-sm p-6 lg:p-8">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-xl font-bold">{selectedOffer.candidate_name}</h2>
                <p className="text-sm text-muted-foreground mt-1">ID: {selectedOffer.id.substring(0, 8).toUpperCase()}</p>
              </div>
              <div className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border">
                {selectedOffer.status}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <User className="w-4 h-4" />
                  <p className="text-xs">Candidate</p>
                </div>
                <p className="font-medium text-foreground">{selectedOffer.candidate_name}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Briefcase className="w-4 h-4" />
                  <p className="text-xs">Position</p>
                </div>
                <p className="font-medium text-foreground">{selectedOffer.designation}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Building className="w-4 h-4" />
                  <p className="text-xs">Department</p>
                </div>
                <p className="font-medium text-foreground">Human Resources</p>
              </div>
              
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <IndianRupee className="w-4 h-4" />
                  <p className="text-xs">Salary</p>
                </div>
                <p className="font-medium text-foreground">₹{selectedOffer.salary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <p className="text-xs">Start Date</p>
                </div>
                <p className="font-medium text-foreground">{selectedOffer.start_date}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <p className="text-xs">Expiration Date</p>
                </div>
                <p className="font-medium text-foreground">{selectedOffer.expires_at}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <p className="text-xs">Offer Date</p>
                </div>
                <p className="font-medium text-foreground">{selectedOffer.offer_date}</p>
              </div>
            </div>
          </div>
        </PageContainer>
      </AppLayout>
    );
  }

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
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <SectionCard className="p-0 overflow-hidden bg-card border-border">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select className="border border-border rounded-md px-3 py-2 text-sm text-foreground bg-background min-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
              <option>All Candidates</option>
            </select>
            <div className="flex-1" />
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </div>
        </div>

        <div className="px-4 border-b border-border flex overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as OfferStatus | "All")}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <tab.icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-xs ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {counts[tab.id]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase font-semibold">
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
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">Loading offers...</td></tr>
              ) : filteredOffers.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">No offers found matching criteria.</td></tr>
              ) : (
                filteredOffers.map((offer, index) => {
                  const isExpired = offer.status === "Expired";
                  const initial = offer.candidate_name.split(' ').map(n => n[0]).join('').substring(0, 2);
                  
                  return (
                    <tr key={offer.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-muted-foreground font-medium">{index + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold overflow-hidden">
                            {initial}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{offer.candidate_name}</p>
                            <p className="text-xs text-muted-foreground">{offer.designation}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        ₹{offer.salary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CalendarIcon className="h-4 w-4" />
                          {offer.start_date}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`flex flex-col gap-1 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
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
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CalendarIcon className="h-4 w-4" />
                          {offer.offer_date}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {offer.status === "Draft" && (
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-3 rounded-md text-xs font-medium"
                              onClick={() => sendOfferMutation.mutate(offer.id)}
                              disabled={sendOfferMutation.isPending}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              Send Offer
                            </Button>
                          )}
                          {offer.status === "Accepted" && offer.candidate_status !== "HIRED" && (
                            <Button
                              size="sm"
                              className="bg-emerald-500 hover:bg-emerald-600 text-white"
                              onClick={() => onboardingMutation.mutate(offer.candidate_id)}
                              disabled={onboardingMutation.isPending}
                            >
                              Start Onboarding
                            </Button>
                          )}
                          {offer.candidate_status === "HIRED" && (
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full mr-2">Onboarded</span>
                          )}
                          <button 
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                            onClick={() => setSelectedOffer(offer)}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button 
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            onClick={() => setOfferToDelete(offer.id)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      <ConfirmDialog
        open={!!offerToDelete}
        title="Delete Offer"
        description="Are you sure you want to delete this offer? This action cannot be undone."
        confirmLabel={deleteOfferMutation.isPending ? "Deleting..." : "Delete"}
        onConfirm={() => {
          if (offerToDelete) deleteOfferMutation.mutate(offerToDelete);
        }}
        onCancel={() => setOfferToDelete(null)}
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
