import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, UserPlus, Loader2, Search, Filter, Trash2, Eye, Edit2 } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout, PageContainer, PageHeader, LoadingSkeleton, EmptyState, SectionCard } from "@/components/ui-system";
import { ConfirmDialog } from "@/components/ui-system/ConfirmDialog";
import { getCandidates, createCandidate, deleteCandidate, updateCandidate, Candidate } from "@/services/candidates";
import { CandidateFormModal } from "@/components/candidates/CandidateFormModal";
import { apiPost } from "@/services/api";
import { getLookups } from "@/services/lookups";
import { getMasters } from "@/services/masters";

type TabStatus = "All" | "New" | "Screening" | "Interview" | "Offer" | "Hired" | "Rejected";

export function CandidatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | undefined>(undefined);
  const [candidateToDelete, setCandidateToDelete] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TabStatus>("All");
  const [sourceFilter, setSourceFilter] = useState<string>("All Sources");
  const [jobFilter, setJobFilter] = useState<string>("All Jobs");

  const mastersQuery = useQuery({
    queryKey: ["masters"],
    queryFn: getMasters,
  });

  const lookupsQuery = useQuery({
    queryKey: ["lookups", "candidates-page"],
    queryFn: () => getLookups(["candidate_source"]),
  });

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: getCandidates,
  });

  const createMutation = useMutation({
    mutationFn: createCandidate,
    onSuccess: () => {
      toast.success("Candidate created successfully");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setIsModalOpen(false);
      setEditingCandidate(undefined);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create candidate");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; payload: any }) => updateCandidate(data.id, data.payload),
    onSuccess: () => {
      toast.success("Candidate updated successfully");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setIsModalOpen(false);
      setEditingCandidate(undefined);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update candidate");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCandidate,
    onSuccess: () => {
      toast.success("Candidate removed");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setCandidateToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove candidate");
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await apiPost("/resume/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Resume parsed and candidate created!");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to parse resume");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "NEW":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">New</span>;
      case "SCREENING":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Screening</span>;
      case "INTERVIEW":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">Interview</span>;
      case "OFFERED":
      case "OFFER":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">Offer</span>;
      case "HIRED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Hired</span>;
      case "REJECTED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">Rejected</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">{status}</span>;
    }
  };

  const allCandidates = candidates || [];
  
  const filteredCandidates = allCandidates.filter((cand: Candidate) => {
    const matchesSearch = `${cand.first_name} ${cand.last_name} ${cand.email}`.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (sourceFilter !== "All Sources" && (cand.source || "MANUAL") !== sourceFilter) return false;
    if (jobFilter !== "All Jobs" && cand.designation !== jobFilter) return false;
    if (activeTab === "All") return true;
    if (activeTab === "Offer") return cand.candidate_status === "OFFERED" || cand.candidate_status === "OFFER";
    return cand.candidate_status?.toUpperCase() === activeTab.toUpperCase();
  });

  const getStatusCounts = () => {
    const counts: Record<string, number> = {
      All: allCandidates.length,
      New: 0,
      Screening: 0,
      Interview: 0,
      Offer: 0,
      Hired: 0,
      Rejected: 0
    };
    allCandidates.forEach((c: Candidate) => {
      const status = c.candidate_status?.toUpperCase();
      if (status === "NEW") counts.New++;
      else if (status === "SCREENING") counts.Screening++;
      else if (status === "INTERVIEW") counts.Interview++;
      else if (status === "OFFERED" || status === "OFFER") counts.Offer++;
      else if (status === "HIRED") counts.Hired++;
      else if (status === "REJECTED") counts.Rejected++;
    });
    return counts;
  };

  const counts = getStatusCounts();

  const tabs = [
    { id: "All", label: "All" },
    { id: "New", label: "New" },
    { id: "Screening", label: "Screening" },
    { id: "Interview", label: "Interview" },
    { id: "Offer", label: "Offer" },
    { id: "Hired", label: "Hired" },
    { id: "Rejected", label: "Rejected" },
  ];

  return (
    <AppLayout>
      <PageContainer>
        <div className="flex items-start justify-between mb-6">
          <PageHeader
            title="Candidates"
            description="View and manage candidates across all job postings."
          />
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Autofill by Resume
            </Button>
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Candidate Manually
            </Button>
          </div>
        </div>

        <SectionCard className="p-0 overflow-hidden bg-card border-border mb-6">
          <div className="p-4 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search..." 
                  className="pl-9 bg-background"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select 
                className="border border-border rounded-md px-3 py-2 text-sm text-foreground bg-background min-w-[140px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
              >
                <option value="All Jobs">All Jobs</option>
                {(mastersQuery.data?.designations ?? []).map((item: any) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
              <select 
                className="border border-border rounded-md px-3 py-2 text-sm text-foreground bg-background min-w-[140px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="All Sources">All Sources</option>
                {(lookupsQuery.data?.candidate_source ?? []).map((item: any) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
              <div className="flex-1" />
              <Button variant="outline" className="gap-2 shrink-0">
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
                  onClick={() => setActiveTab(tab.id as TabStatus)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive 
                      ? "border-emerald-500 text-emerald-600" 
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isActive ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                    {counts[tab.id]}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">#</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Name</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Job</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Source</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Experience</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Expected Salary</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Status</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">Loading candidates...</td></tr>
                ) : filteredCandidates.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">No candidates found matching criteria.</td></tr>
                ) : (
                  filteredCandidates.map((candidate: Candidate, index: number) => {
                    const initial = `${candidate.first_name?.[0] || ""}${candidate.last_name?.[0] || ""}`.toUpperCase();
                    // Generate a color based on initials just for some visual variety like the mockup
                    const colors = ["bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700", "bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-emerald-100 text-emerald-700"];
                    const colorClass = colors[index % colors.length];

                    return (
                      <tr key={candidate.id} className="hover:bg-muted/30 transition-colors bg-card">
                        <td className="px-6 py-4 text-muted-foreground font-medium">{index + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${colorClass}`}>
                              {initial}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{candidate.first_name} {candidate.last_name}</p>
                              <p className="text-sm text-muted-foreground">{candidate.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-foreground">{candidate.current_company || "-"}</p>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {candidate.source || "Manual"}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {candidate.parsed_resume_json?.experience_years ? `${candidate.parsed_resume_json.experience_years} Years` : "-"}
                        </td>
                        <td className="px-6 py-4 font-medium text-foreground">
                          {candidate.expected_ctc ? `₹${candidate.expected_ctc.toLocaleString()}` : "-"}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(candidate.candidate_status)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => navigate(`/candidates/${candidate.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => {
                                setEditingCandidate(candidate);
                                setIsModalOpen(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setCandidateToDelete(candidate.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
      </PageContainer>

      {isModalOpen && (
        <CandidateFormModal
          initialData={editingCandidate}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCandidate(undefined);
          }}
          onSubmit={(data) => {
            if (editingCandidate) {
              updateMutation.mutate({ id: editingCandidate.id, payload: data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={!!candidateToDelete}
        title="Remove Candidate"
        description="Are you sure you want to remove this candidate? This action cannot be undone."
        confirmLabel={deleteMutation.isPending ? "Removing..." : "Remove"}
        onConfirm={() => {
          if (candidateToDelete) deleteMutation.mutate(candidateToDelete);
        }}
        onCancel={() => setCandidateToDelete(null)}
      />
    </AppLayout>
  );
}
