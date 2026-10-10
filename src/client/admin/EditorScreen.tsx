import { ArrowLeft } from "lucide-react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/client/shared/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminModule } from "@/quizzes/registry.admin";

export function EditorScreen({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const quiz = trpc.quiz.get.useQuery({ quizId });
  const update = trpc.quiz.update.useMutation();
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const close = () => {
    if (!dirty.current || window.confirm("Есть несохранённые изменения. Выйти без сохранения?")) {
      onClose();
    }
  };
  const onSave = async (content: unknown) => {
    try {
      await update.mutateAsync({ quizId, content });
      await Promise.all([utils.quiz.get.invalidate({ quizId }), utils.quiz.list.invalidate()]);
      toast.success("Сохранено — гости уже видят изменения");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  if (quiz.isPending) return <Skeleton className="mx-auto h-[70vh] max-w-7xl" />;
  if (quiz.error) return <p className="text-destructive">{quiz.error.message}</p>;
  const m = getAdminModule(quiz.data.type);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={close}>
          <ArrowLeft /> Назад
        </Button>
        <h2 className="font-semibold text-lg">{quiz.data.title}</h2>
      </div>
      {m ? (
        <m.Editor
          content={quiz.data.content}
          saving={update.isPending}
          onSave={onSave}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <p>Неизвестный тип викторины</p>
      )}
    </div>
  );
}
