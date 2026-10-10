import { toast } from "sonner";
import { trpc } from "@/client/shared/trpc";
import { getAdminModule } from "@/quizzes/registry.admin";
import type { HostSnapshot } from "@/shared/game";

type Playing = Extract<HostSnapshot, { status: "playing" }>;

export function ConsoleScreen({ snapshot }: { snapshot: Playing }) {
  const onError = (e: { message: string }) => toast.error(e.message);
  const dispatch = trpc.game.dispatch.useMutation({ onError });
  const reset = trpc.game.reset.useMutation({ onError });
  const m = getAdminModule(snapshot.quizType);
  if (!m) return <p>Неизвестный тип викторины: {snapshot.quizType}</p>;
  return (
    <m.HostConsole
      view={snapshot.view}
      busy={dispatch.isPending}
      dispatch={(action) => dispatch.mutate({ action })}
      onReset={() => reset.mutate()}
    />
  );
}
