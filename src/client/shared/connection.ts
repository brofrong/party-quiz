import { useSyncExternalStore } from "react";
import { useWsClient } from "./Providers";

export type ConnectionState = "connecting" | "connected" | "offline";

export function useConnectionState(): ConnectionState {
  const ws = useWsClient();
  return useSyncExternalStore(
    (onChange) => {
      const sub = ws.connectionState.subscribe({ next: onChange });
      return () => sub.unsubscribe();
    },
    () => {
      const s = ws.connectionState.get();
      if (s.state === "pending" || s.state === "idle") return "connected";
      return s.error ? "offline" : "connecting";
    },
  );
}
