import { apiGet, apiPost, apiPatch, apiDelete } from "./api";

export interface OfferCreateRequest {
  candidate_id: string;
  designation: string;
  salary: number;
  start_date: string;
  expires_at: string;
}

export function createOffer(payload: OfferCreateRequest) {
  return apiPost<OfferCreateRequest, { message: string, offer_id: string }>("/offers", payload);
}

export function updateOfferStatus(offerId: string, status: string) {
  return apiPatch<any>(`/offers/${offerId}/status`, { status });
}

export function deleteOffer(offerId: string) {
  return apiDelete<any>(`/offers/${offerId}`);
}

export function sendOffer(offerId: string) {
  return apiPost<any, any>(`/offers/${offerId}/send`, {});
}

export function respondToOffer(offerId: string, action: "accept" | "reject") {
  // We use standard fetch here to bypass authentication headers if the api module adds them.
  // Wait, let's use apiPost. The backend doesn't check auth for this endpoint.
  // We might need a raw fetch if the auth token intereferes, but let's just use apiPost.
  // Actually, standard apiPost might add Authorization headers which is fine. If the user doesn't have one, it might fail if apiPost throws when missing token?
  // Our apiPost typically doesn't throw client side, it just sends the token if it exists.
  return apiPost<{ action: string }, { message: string }>(`/offers/${offerId}/respond`, { action });
}
