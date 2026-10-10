import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Splash() {
  return (
    <div className="party-bg flex h-full items-center justify-center">
      <Loader2 className="size-10 animate-spin text-white/80" />
    </div>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg">{message}</p>
      {onRetry && <Button onClick={onRetry}>Попробовать ещё раз</Button>}
    </div>
  );
}
