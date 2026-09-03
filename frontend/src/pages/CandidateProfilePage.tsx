import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, MapPin, Mail, Phone, Briefcase, Calendar, Clock, IndianRupee, FileText } from "lucide-react";
import { format } from "date-fns";

import { AppLayout, PageContainer, LoadingSkeleton, SectionCard } from "@/components/ui-system";
import { Button } from "@/components/ui/button";
import { getCandidate } from "@/services/candidates";

export function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: candidate, isLoading, error } = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => getCandidate(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <LoadingSkeleton rows={10} />
        </PageContainer>
      </AppLayout>
    );
  }

  if (error || !candidate) {
    return (
      <AppLayout>
        <PageContainer>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h2 className="text-xl font-semibold mb-2">Candidate not found</h2>
            <p className="text-muted-foreground mb-4">The candidate you are looking for does not exist or has been removed.</p>
            <Button onClick={() => navigate("/candidates")}>Back to Candidates</Button>
          </div>
        </PageContainer>
      </AppLayout>
    );
  }

  const initial = `${candidate.first_name?.[0] || ""}${candidate.last_name?.[0] || ""}`.toUpperCase();
  const fullName = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || "Unknown Candidate";
  const resumeJson = candidate.parsed_resume_json || {};

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "OFFERED":
      case "OFFER":
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-600 border border-orange-200">Offer</span>;
      case "HIRED":
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">Hired</span>;
      default:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">{status}</span>;
    }
  };


  return (
    <AppLayout>
      <PageContainer>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{fullName}</h1>
            <p className="text-muted-foreground">Candidate profile</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/candidates")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        <SectionCard className="p-0 overflow-hidden bg-card border-border mb-6">
          {/* Top Info Banner */}
          <div className="p-6 border-b border-border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-3xl font-bold bg-slate-200 text-slate-800">
                  {initial}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1">{fullName}</h2>
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
                    {candidate.current_company || "Unknown Company"}
                  </p>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {candidate.email || "-"}</span>
                    <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {candidate.phone || "-"}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {resumeJson.location || "-"}</span>
                  </div>
                </div>
              </div>
              <div>
                {getStatusBadge(candidate.candidate_status)}
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Sidebar */}
            <div className="w-full md:w-80 border-r border-border p-6 bg-muted/10 space-y-8 shrink-0">
              
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground mb-4 border-b pb-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" /> Applied For
                </h3>
                <div className="bg-background rounded-lg border border-border p-4">
                  <p className="font-semibold text-foreground">{candidate.current_company || "General Application"}</p>
                  <p className="text-xs text-muted-foreground mb-3 font-mono">APP-1-00001</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Full-time</p>
                    <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> Head Office</p>
                    <p className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Human Resources</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground mb-4 border-b pb-2">
                  <IndianRupee className="w-4 h-4 text-muted-foreground" /> Salary
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Current</p>
                    <p className="font-medium text-foreground">{resumeJson.current_ctc ? `₹${Number(resumeJson.current_ctc).toLocaleString()}.00` : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected</p>
                    <p className="font-medium text-foreground">{candidate.expected_ctc ? `₹${candidate.expected_ctc.toLocaleString()}.00` : "-"}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground mb-4 border-b pb-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" /> Application
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Applied</p>
                    <p className="font-medium text-foreground">{format(new Date(candidate.created_at), "yyyy-MM-dd")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Source</p>
                    <p className="font-medium text-foreground">{candidate.source || "Manual"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Terms & Conditions</p>
                    <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">Accepted</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Main Content */}
            <div className="flex-1 p-6 lg:p-8 space-y-10">
              
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground mb-4 border-b pb-2">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Personal Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Gender</p>
                    <p className="font-medium text-foreground">{resumeJson.gender || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Date of Birth</p>
                    <p className="font-medium text-foreground">{resumeJson.date_of_birth || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notice Period</p>
                    <p className="font-medium text-foreground">{candidate.notice_period || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Experience</p>
                    <p className="font-medium text-foreground">{resumeJson.experience_years ? `${resumeJson.experience_years} years` : "-"}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground mb-4 border-b pb-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" /> Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Address</p>
                    <p className="font-medium text-foreground">{resumeJson.address || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">City</p>
                    <p className="font-medium text-foreground">{resumeJson.city || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">State</p>
                    <p className="font-medium text-foreground">{resumeJson.state || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Country</p>
                    <p className="font-medium text-foreground">{resumeJson.country || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Zip Code</p>
                    <p className="font-medium text-foreground">{resumeJson.zip_code || "-"}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground mb-4 border-b pb-2">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Documents
                </h3>
                <div className="flex gap-4">
                  {candidate.resume_url ? (
                    <a 
                      href={`http://127.0.0.1:8001${candidate.resume_url}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10 hover:bg-primary/10 transition-colors w-72"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">Resume</p>
                          <p className="text-xs text-muted-foreground">Click to download</p>
                        </div>
                      </div>
                      <Download className="w-4 h-4 text-muted-foreground" />
                    </a>
                  ) : (
                    <div className="p-4 bg-muted/30 rounded-xl border border-border w-72 text-center text-sm text-muted-foreground">
                      No documents available
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </SectionCard>
      </PageContainer>
    </AppLayout>
  );
}
