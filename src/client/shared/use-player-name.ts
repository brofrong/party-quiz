import { trpc } from "./trpc";

/** The guest's display name (stored in their session), for quizzes where guests answer. */
export function usePlayerName() {
  const utils = trpc.useUtils();
  const me = trpc.me.useQuery();
  const save = trpc.profile.setName.useMutation();
  return {
    name: me.data?.hasName ? (me.data.user?.name ?? null) : null,
    hasName: me.data?.hasName ?? false,
    saving: save.isPending,
    async setName(name: string) {
      await save.mutateAsync({ name });
      await utils.me.invalidate();
    },
  };
}
