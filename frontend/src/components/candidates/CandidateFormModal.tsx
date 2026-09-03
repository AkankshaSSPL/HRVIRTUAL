import { useState, useRef } from "react";
import { X, Upload, Loader2, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CandidateCreateRequest, Candidate } from "@/services/candidates";
import { apiPost } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { getLookups } from "@/services/lookups";

interface CandidateFormModalProps {
  onClose: () => void;
  onSubmit: (data: CandidateCreateRequest) => void;
  isSubmitting: boolean;
  initialData?: Candidate;
}

export function CandidateFormModal({ onClose, onSubmit, isSubmitting, initialData }: CandidateFormModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const lookupsQuery = useQuery({
    queryKey: ["lookups", "candidate-form"],
    queryFn: () => getLookups(["candidate_source"]),
  });
  
  const [formData, setFormData] = useState<CandidateCreateRequest>({
    first_name: initialData?.first_name || "",
    last_name: initialData?.last_name || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    current_company: initialData?.current_company || "",
    expected_ctc: initialData?.expected_ctc,
    current_ctc: initialData?.parsed_resume_json?.current_ctc || undefined,
    notice_period: initialData?.notice_period || "",
    source: initialData?.source || "Manual",
    experience_years: initialData?.parsed_resume_json?.experience_years || undefined,
    city: initialData?.parsed_resume_json?.city || "",
    state: initialData?.parsed_resume_json?.state || "",
    resume_url: initialData?.resume_url || "",
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      // Use the generic API service to upload the resume
      const response = await apiPost<FormData, { url: string }>("/candidates/upload-resume", uploadData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFormData({ ...formData, resume_url: response.url });
      toast.success("Resume attached successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload resume");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-xl">
        <div className="flex items-center justify-between border-b p-6 sticky top-0 bg-card z-10">
          <h2 className="text-xl font-bold">{initialData ? "Edit Candidate" : "Add Candidate"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">First Name <span className="text-red-500">*</span></label>
              <Input
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name <span className="text-red-500">*</span></label>
              <Input
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Doe"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Email <span className="text-red-500">*</span></label>
              <Input
                required
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone <span className="text-red-500">*</span></label>
              <Input
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Expected CTC <span className="text-red-500">*</span></label>
              <Input
                required
                type="number"
                value={formData.expected_ctc || ""}
                onChange={(e) => setFormData({ ...formData, expected_ctc: parseFloat(e.target.value) })}
                placeholder="e.g. 100000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current CTC</label>
              <Input
                type="number"
                value={formData.current_ctc || ""}
                onChange={(e) => setFormData({ ...formData, current_ctc: parseFloat(e.target.value) })}
                placeholder="e.g. 80000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Company / Job <span className="text-red-500">*</span></label>
              <Input
                required
                value={formData.current_company}
                onChange={(e) => setFormData({ ...formData, current_company: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Source <span className="text-red-500">*</span></label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.source || ""}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                required
              >
                <option value="">Select source</option>
                {(lookupsQuery.data?.candidate_source ?? []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notice Period</label>
              <Input
                value={formData.notice_period}
                onChange={(e) => setFormData({ ...formData, notice_period: e.target.value })}
                placeholder="e.g. 30 days"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Experience (Years) <span className="text-red-500">*</span></label>
              <Input
                required
                type="number"
                step="0.5"
                value={formData.experience_years || ""}
                onChange={(e) => setFormData({ ...formData, experience_years: parseFloat(e.target.value) })}
                placeholder="e.g. 5"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="San Francisco"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">State</label>
              <Input
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="CA"
              />
            </div>
          </div>

          <div className="mt-6 p-4 border border-dashed rounded-lg bg-muted/20">
            <label className="text-sm font-medium mb-3 block">Resume Document</label>
            <div className="flex items-center gap-4">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".pdf,.doc,.docx" 
                onChange={handleFileUpload} 
              />
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {formData.resume_url ? "Replace Resume" : "Upload Resume"}
              </Button>
              {formData.resume_url && (
                <span className="text-sm text-emerald-600 flex items-center gap-1">
                  <FileText className="w-4 h-4" /> Attached
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Candidate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
