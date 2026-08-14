import React from "react";

import { numberToWords } from "../../utils/numberToWords";

export interface PayslipData {
  employee: {
    name: string;
    code: string;
    designation: string | null;
    joining_date: string | null;
    uan: string | null;
    pan: string | null;
  };
  run: {
    month: number;
    year: number;
  };
  attendance: {
    paid_days: number;
    lop_days: number;
  };
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  ytd_earnings: Record<string, number>;
  ytd_deductions: Record<string, number>;
  totals: {
    gross_earnings: number;
    total_deductions: number;
    net_pay: number;
  };
}

export function SalarySlipTemplate({ data }: { data: PayslipData }) {
  const monthName = new Date(data.run.year, data.run.month - 1).toLocaleString('default', { month: 'long' });
  
  // Format numbers to INR currency
  const fmt = (num: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(num);

  const formatName = (key: string) => {
    const map: Record<string, string> = {
      'HRA': 'House Rent Allowance',
      'CA': 'Conveyance Allowance',
      'EA': 'Children Education Allowance',
      'MA': 'Medical Allowance',
      'LTA': 'Leave Travel Allowance',
      'BASIC': 'Basic',
      'DA': 'Dearness Allowance',
      'EPF': 'EPF Contribution',
      'PT': 'Professional Tax',
      'TDS': 'Income Tax'
    };
    const code = key.toUpperCase();
    if (map[code]) return map[code];
    return key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const earningsList = Object.entries(data.earnings)
    .filter(([_, v]) => v > 0)
    .map(([k, v]): [string, number] => [formatName(k), v]);
  
  // Convert deductions object to a Map to easily check and add items
  const deductionsMap = new Map(Object.entries(data.deductions));
  // Ensure Income Tax is always present
  if (!deductionsMap.has("Income Tax") && !deductionsMap.has("TDS") && !deductionsMap.has("INCOME_TAX")) {
    deductionsMap.set("Income Tax", 0);
  }
  
  // Format keys and filter out 0s unless it's Income Tax
  const deductionsList = Array.from(deductionsMap.entries())
    .map(([k, v]): [string, number] => [formatName(k), v])
    .filter(([k, v]) => v > 0 || k.toLowerCase().includes("tax"));

  return (
    <div className="w-[800px] max-w-full bg-white p-8 font-sans text-gray-900 border" style={{ margin: '0 auto' }}>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-blue-600 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sveltoz Solutions Private Limited</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-sm">
            Show Room Right, 83, Deodar, 2nd Floor, Lane 1, Behind Royal Enfield, Bhusari Colony, Pune Maharashtra 411038 India
          </p>
        </div>
        <div className="flex-shrink-0">
          <img src="/sveltoz-logo.png" alt="Sveltoz Logo" className="h-16 w-auto object-contain drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
        </div>
      </div>

      <h2 className="text-xl font-bold mb-6">Payslip for the month of {monthName} {data.run.year}</h2>

      {/* Pay Summary */}
      <div className="mb-6">
        <h3 className="text-blue-600 font-semibold mb-3 tracking-wider uppercase text-sm">Pay Summary</h3>
        <div className="flex justify-between items-end">
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <div className="text-gray-500">Employee Name:</div>
            <div>{data.employee.name}, {data.employee.code}</div>
            
            <div className="text-gray-500">Designation:</div>
            <div>{data.employee.designation || "-"}</div>
            
            <div className="text-gray-500">Date of Joining:</div>
            <div>{data.employee.joining_date ? new Date(data.employee.joining_date).toLocaleDateString('en-GB') : "-"}</div>
            
            <div className="text-gray-500">Pay Period:</div>
            <div>{monthName} {data.run.year}</div>
            
            <div className="text-gray-500">Pay Date:</div>
            <div>{new Date(data.run.year, data.run.month, 0).toLocaleDateString('en-GB')}</div>
            
            <div className="text-gray-500">UAN:</div>
            <div>{data.employee.uan || "XXXXXXXXXXXX"}</div>
          </div>

          <div className="text-center p-4 relative overflow-hidden">
             {/* SAMPLE Watermark */}
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
               <span className="text-red-500 text-3xl font-bold transform -rotate-45 whitespace-nowrap">SAMPLE ONLY</span>
             </div>
            <div className="text-gray-700 text-sm mb-1 relative z-10">Total Net Pay</div>
            <div className="text-4xl font-bold mb-2 relative z-10">{fmt(data.totals.net_pay)}</div>
            <div className="text-xs text-gray-500 relative z-10">
              Paid Days : {data.attendance.paid_days} | LOP Days : {data.attendance.lop_days}
            </div>
          </div>
        </div>
      </div>

      <hr className="border-t-2 border-blue-200 mb-6" />

      {/* Earnings and Deductions Table Layout */}
      <div className="w-full text-sm">
        {/* EARNINGS */}
        <div className="mb-8">
          <div className="flex text-blue-600 font-semibold uppercase mb-2 tracking-wider">
            <div className="flex-1">Earnings</div>
            <div className="w-32 text-right">Amount</div>
            <div className="w-32 text-right">YTD</div>
          </div>
          
          {earningsList.map(([key, val]) => (
            <div key={key} className="flex py-2 border-b border-gray-100">
              <div className="flex-1 text-gray-800">{key}</div>
              <div className="w-32 text-right">{fmt(val)}</div>
              <div className="w-32 text-right">{fmt(data.ytd_earnings[key] || val)}</div>
            </div>
          ))}
          
          <div className="flex py-3 font-bold mt-2">
            <div className="flex-1">Gross Earnings</div>
            <div className="w-32 text-right">{fmt(data.totals.gross_earnings)}</div>
            <div className="w-32 text-right"></div>
          </div>
        </div>

        <hr className="border-t-2 border-blue-200 mb-6" />

        {/* DEDUCTIONS */}
        <div className="mb-8">
          <div className="flex text-blue-600 font-semibold uppercase mb-2 tracking-wider">
            <div className="flex-1">Deductions</div>
            <div className="w-32 text-right">(-)Amount</div>
            <div className="w-32 text-right">YTD</div>
          </div>
          
          {deductionsList.map(([key, val]) => (
            <div key={key} className="flex py-2 border-b border-gray-100">
              <div className="flex-1 text-gray-800">{key}</div>
              <div className="w-32 text-right">{fmt(val)}</div>
              <div className="w-32 text-right">{fmt(data.ytd_deductions[key] || val)}</div>
            </div>
          ))}
          
          <div className="flex py-3 font-bold mt-2">
            <div className="flex-1">Total Deductions</div>
            <div className="w-32 text-right">{fmt(data.totals.total_deductions)}</div>
            <div className="w-32 text-right"></div>
          </div>
        </div>

        {/* NET PAY */}
        <div className="flex py-4 font-bold bg-blue-50 px-4 rounded-md mb-8">
          <div className="flex-1 text-blue-900">NET PAY (Gross Earnings - Total Deductions)</div>
          <div className="w-32 text-right text-blue-900">{fmt(data.totals.net_pay)}</div>
        </div>

        <div className="text-center py-4 border-t border-b border-gray-200 mb-8">
          <span className="text-gray-600">Total Net Payable</span>
          <span className="text-xl font-bold ml-4 mr-2">{fmt(data.totals.net_pay)}</span>
          <span className="text-gray-500">(Indian Rupee {numberToWords(Math.floor(data.totals.net_pay))} Only)</span>
        </div>

        <div className="text-center text-red-500 font-bold text-sm mb-4">
          SAMPLE - FOR DEVELOPMENT AND TESTING ONLY - NOT A VALID PAYSLIP
        </div>
        <div className="text-center text-gray-400 text-xs">
          -- This is a system-generated sample document. --
        </div>
      </div>
    </div>
  );
}
