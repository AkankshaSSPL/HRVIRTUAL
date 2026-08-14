import React from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { SalarySlipTemplate, PayslipData } from "./SalarySlipTemplate";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/services/api";
// @ts-ignore
import html2pdf from "html2pdf.js";

interface SalarySlipModalProps {
  runId: string | null;
  employeeId: string | null;
  onClose: () => void;
}

export function SalarySlipModal({ runId, employeeId, onClose }: SalarySlipModalProps) {
  const isOpen = Boolean(runId && employeeId);
  
  const { data, isLoading, error } = useQuery<PayslipData>({
    queryKey: ["payslip", runId, employeeId],
    queryFn: async () => {
      const data = await apiGet<PayslipData>(`/payroll/runs/${runId}/slip/${employeeId}`);
      return data;
    },
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const handlePrint = () => {
    const element = document.getElementById("payslip-container");
    if (!element || !data) return;

    const opt = {
      margin:       0.3,
      filename:     `Payslip_${data.employee.name.replace(/\s+/g, '_')}_${data.run.month}_${data.run.year}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:bg-white print:static print:inset-auto print:z-auto print:flex print:items-start print:justify-start p-4 print:p-0">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:overflow-visible">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white z-20 py-2 border-b px-6 print:hidden">
          <h2 className="text-xl font-bold">Payslip Preview</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}><X className="w-4 h-4 mr-2"/> Close</Button>
            <Button onClick={handlePrint} disabled={!data}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>
        
        <div className="flex justify-center print:block p-6 print:p-0">
          {isLoading && <div className="p-12 text-center text-gray-500">Loading payslip data...</div>}
          {error && <div className="p-12 text-center text-red-500">Failed to load payslip data.</div>}
          {data && (
            <div id="payslip-container" className="print-area shadow-xl border rounded-md bg-white print:shadow-none print:border-none">
              <SalarySlipTemplate data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
