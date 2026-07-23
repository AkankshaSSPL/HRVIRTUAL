import { apiGet, apiPatch, apiPost } from "@/services/api";

export type SeatRecord = {
  label: string;
  zone: string | null;
  row: string | null;
  col: number | null;
  seat_type: string;
  status: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_designation: string | null;
  employee_department: string | null;
  employee_email: string | null;
};

export type SeatSummary = {
  available: number;
  occupied: number;
  reserved: number;
  maintenance: number;
  blocked: number;
};

export type SeatsResponse = {
  seats: SeatRecord[];
  summary: SeatSummary;
};

export function getSeats() {
  return apiGet<SeatsResponse>("/seats");
}

export function assignSeat(seatLabel: string, employeeId: string) {
  return apiPost<SeatRecord>(`/seats/${seatLabel}/assign`, { employee_id: employeeId });
}

export function vacateSeat(seatLabel: string) {
  return apiPost<SeatRecord>(`/seats/${seatLabel}/vacate`, {});
}

export function updateSeatStatus(seatLabel: string, status: string) {
  return apiPatch<SeatRecord>(`/seats/${seatLabel}/status`, { status });
}