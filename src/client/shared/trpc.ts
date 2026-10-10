import { QueryClient } from "@tanstack/react-query";
import { createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/router";

export const trpc = createTRPCReact<AppRouter>();

export function createClients() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const wsClient = createWSClient({
    url: `${proto}//${location.host}/api/trpc`,
    retryDelayMs: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    keepAlive: { enabled: true, intervalMs: 20_000, pongTimeoutMs: 5_000 },
  });
  const trpcClient = trpc.createClient({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: wsLink({ client: wsClient }),
        false: httpBatchLink({ url: "/api/trpc" }),
      }),
    ],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
  });
  return { wsClient, trpcClient, queryClient };
}
export type Clients = ReturnType<typeof createClients>;
