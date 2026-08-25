import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/services/api";

interface CreateOfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOfferModal({ open, onOpenChange }: CreateOfferModalProps) {
  const [loading, setLoading] = useState(false);

  const { data: employeesData } = useQuery({
    queryKey: ["employees"],
    queryFn: () => apiGet<{ items: any[] }>("/employees?page_size=100"),
  });
  
  const { data: mastersData } = useQuery({
    queryKey: ["masters"],
    queryFn: () => apiGet<{ departments: any[], designations: any[] }>("/masters"),
  });
  
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<{ data: any[] }>("/users"),
  });

  const employees = employeesData?.items || [];
  const designations = mastersData?.designations || [];
  const departments = mastersData?.departments || [];
  const users = usersData?.data || [];

  const handleSave = () => {
    setLoading(true);
    // Simulate save
    setTimeout(() => {
      setLoading(false);
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Create New Offer
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto flex flex-col gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Candidate <span className="text-rose-500">*</span>
            </label>
            <select className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="" disabled selected>Select candidate</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Position <span className="text-rose-500">*</span>
            </label>
            <select className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="" disabled selected>Select position</option>
              {designations.map((desig) => (
                <option key={desig.id} value={desig.id}>
                  {desig.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Department
            </label>
            <select className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="" disabled selected>Select department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Salary <span className="text-rose-500">*</span>
            </label>
            <Input placeholder="e.g. 5000.00" type="number" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Start Date <span className="text-rose-500">*</span>
            </label>
            <Input type="date" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Expiration Date <span className="text-rose-500">*</span>
            </label>
            <Input type="date" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Approved By <span className="text-rose-500">*</span>
            </label>
            <select className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="" disabled selected>Select approver</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} ({u.roles?.join(", ") || "User"})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">
              Benefits
            </label>
            <textarea 
              className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[100px] resize-y" 
              placeholder="e.g. Health insurance, 20 days annual leave, remote work..." 
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50/50 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            className="bg-emerald-500 hover:bg-emerald-600 text-white" 
            onClick={handleSave} 
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
