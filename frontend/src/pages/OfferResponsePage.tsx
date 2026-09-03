import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { respondToOffer } from "@/services/offers";
import { Button } from "@/components/ui/button";

export function OfferResponsePage() {
  const { offerId } = useParams<{ offerId: string }>();
  const [searchParams] = useSearchParams();
  const action = searchParams.get("action") as "accept" | "reject" | null;

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) return;
    if (!offerId || (action !== "accept" && action !== "reject")) {
      setStatus("error");
      setMessage("Invalid offer link or missing action parameter.");
      return;
    }

    hasAttempted.current = true;
    
    respondToOffer(offerId, action)
      .then((res) => {
        setStatus("success");
        setMessage(res.message || `Offer ${action}ed successfully.`);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message || "Failed to submit your response. It may have expired or already been answered.");
      });
  }, [offerId, action]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border">
        {status === "loading" && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <h2 className="text-xl font-semibold text-gray-800">Processing your response...</h2>
            <p className="text-gray-500 mt-2">Please wait a moment.</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center py-4">
            {action === "accept" ? (
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-6" />
            ) : (
              <XCircle className="w-16 h-16 text-rose-500 mb-6" />
            )}
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {action === "accept" ? "Offer Accepted!" : "Offer Declined"}
            </h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              {action === "accept" 
                ? "Congratulations! Your acceptance has been recorded. Our HR team will be in touch shortly to begin your onboarding process."
                : "Your decision has been recorded. We wish you the best of luck in your future endeavors."}
            </p>
            
            <p className="text-sm text-gray-400">You may now close this window.</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center py-4">
            <XCircle className="w-16 h-16 text-rose-500 mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
            <p className="text-gray-600 mb-8">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
