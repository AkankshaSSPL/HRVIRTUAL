import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/services/api";
import { createOffer } from "@/services/offers";
import toast from "react-hot-toast";

interface CreateOfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCandidateId?: string;
}

export function CreateOfferModal({ open, onOpenChange, defaultCandidateId }: CreateOfferModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    candidate_id: defaultCandidateId || "",
    designation_id: "",
    salary: "",
    start_date: "",
    expires_at: "",
  });

  useEffect(() => {
    if (defaultCandidateId) {
      setFormData(prev => ({ ...prev, candidate_id: defaultCandidateId }));
    }
  }, [defaultCandidateId]);

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => apiGet<any[]>("/candidates"),
  });
  
  const { data: mastersData } = useQuery({
    queryKey: ["masters"],
    queryFn: () => apiGet<{ departments: any[], designations: any[] }>("/masters"),
  });

  const designations = mastersData?.designations || [];

  const mutation = useMutation({
    mutationFn: createOffer,
    onSuccess: () => {
      toast.success("Offer created successfully!");
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      onOpenChange(false);
      setFormData({
        candidate_id: "",
        designation_id: "",
        salary: "",
        start_date: "",
        expires_at: "",
      });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create offer");
    }
  });

  const handleSave = () => {
    if (!formData.candidate_id || !formData.designation_id || !formData.salary || !formData.start_date || !formData.expires_at) {
      toast.error("Please fill all required fields");
      return;
    }
    
    const desigName = designations.find(d => d.id === formData.designation_id)?.name || "Unknown";
    
    mutation.mutate({
      candidate_id: formData.candidate_id,
      designation: desigName,
      salary: parseFloat(formData.salary),
      start_date: formData.start_date,
      expires_at: formData.expires_at,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-semibold text-foreground">
            Create New Offer
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto flex flex-col gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Candidate <span className="text-rose-500">*</span>
            </label>
            <select 
              value={formData.candidate_id}
              onChange={(e) => setFormData({ ...formData, candidate_id: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-md border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="" disabled>Select candidate</option>
              {candidates?.map((cand) => (
                <option key={cand.id} value={cand.id}>
                  {cand.first_name} {cand.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Position <span className="text-rose-500">*</span>
            </label>
            <select 
              value={formData.designation_id}
              onChange={(e) => setFormData({ ...formData, designation_id: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-md border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="" disabled>Select position</option>
              {designations.map((desig) => (
                <option key={desig.id} value={desig.id}>
                  {desig.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Salary <span className="text-rose-500">*</span>
            </label>
            <Input 
              placeholder="e.g. 50000.00" 
              type="number" 
              value={formData.salary}
              onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Start Date <span className="text-rose-500">*</span>
            </label>
            <Input 
              type="date" 
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Expiration Date <span className="text-rose-500">*</span>
            </label>
            <Input 
              type="date" 
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/50/50 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            className="bg-emerald-500 hover:bg-emerald-600 text-white" 
            onClick={handleSave} 
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : "Save Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
