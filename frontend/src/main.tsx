import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";

import { ThemeProvider } from "@/components/ui-system";
import { router } from "@/routes/router";
import "@/styles.css";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => toast.error(error.message || "An error occurred fetching data"),
  }),
  mutationCache: new MutationCache({
    onError: (error) => toast.error(error.message || "Action failed"),
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster 
          position="bottom-right" 
          toastOptions={{
            duration: 4000,
            className: 'animate-swal-pop',
            style: {
              fontSize: '15px',
              padding: '16px 24px',
              maxWidth: '450px',
              fontWeight: '600',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              color: '#1e293b',
              border: '1px solid rgba(226, 232, 240, 0.8)',
            },
            success: {
              style: {
                background: 'rgba(240, 253, 244, 0.95)',
                color: '#166534',
                border: '1px solid rgba(187, 247, 208, 0.5)',
              },
              iconTheme: {
                primary: '#16a34a',
                secondary: '#fff',
              },
            },
            error: {
              style: {
                background: 'rgba(254, 242, 242, 0.95)',
                color: '#991b1b',
                border: '1px solid rgba(254, 202, 202, 0.5)',
              },
              iconTheme: {
                primary: '#dc2626',
                secondary: '#fff',
              },
            },
          }} 
        />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
