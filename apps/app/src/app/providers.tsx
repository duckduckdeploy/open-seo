"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => {
      const client: QueryClient = new QueryClient({
        // Anything done in the dashboard may have spent credits, so re-check the balance after it.
        mutationCache: new MutationCache({ onSettled: () => void client.invalidateQueries({ queryKey: ["balance"] }) }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Never retry client errors: a retry of a paid lookup would spend credits twice.
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
          },
          mutations: { retry: false },
        },
      });
      return client;
    },
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
