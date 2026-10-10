import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Toaster } from "sonner";
import { type Clients, createClients, trpc } from "./trpc";

const WsContext = createContext<Clients["wsClient"] | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [clients] = useState(createClients);
  return (
    <trpc.Provider client={clients.trpcClient} queryClient={clients.queryClient}>
      <QueryClientProvider client={clients.queryClient}>
        <WsContext.Provider value={clients.wsClient}>
          {children}
          <Toaster theme="dark" richColors position="top-center" />
        </WsContext.Provider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export function useWsClient() {
  const ws = useContext(WsContext);
  if (!ws) throw new Error("useWsClient outside <Providers>");
  return ws;
}
