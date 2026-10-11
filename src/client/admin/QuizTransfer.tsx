import { Download, Upload } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/client/shared/trpc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pluralRu } from "@/lib/plural";

type Pending = { file: unknown; name: string; exportedAt?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;

/** Download/upload a quiz as a JSON file — how edits move between servers (localhost → prod). */
export function QuizTransfer({ quizId, title }: { quizId: string; title: string }) {
  const utils = trpc.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const importQuiz = trpc.quiz.import.useMutation({
    onSuccess: async ({ items }) => {
      await Promise.all([utils.quiz.list.invalidate(), utils.quiz.get.invalidate({ quizId })]);
      toast.success(`Загружено: ${items} ${pluralRu(items, ["вопрос", "вопроса", "вопросов"])}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const download = async () => {
    try {
      const file = await utils.quiz.export.fetch({ quizId });
      const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${quizId}-${localStamp(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось скачать");
    }
  };

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const file = JSON.parse(await f.text());
      setPending({ file, name: f.name, exportedAt: file?.exportedAt });
    } catch {
      toast.error("Это не JSON-файл викторины");
    }
  };

  return (
    <>
      <Button variant="outline" onClick={download} data-testid={`export-${quizId}`}>
        <Download /> Скачать
      </Button>
      <Button
        variant="outline"
        disabled={importQuiz.isPending}
        onClick={() => input.current?.click()}
        data-testid={`import-${quizId}`}
      >
        <Upload /> Загрузить
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={pick}
        data-testid={`import-file-${quizId}`}
      />
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Заменить «{title}» содержимым файла?</AlertDialogTitle>
            <AlertDialogDescription>
              Файл «{pending?.name}»
              {pending?.exportedAt
                ? `, выгружен ${new Date(pending.exportedAt).toLocaleString("ru-RU")}`
                : ""}
              . Текущие кадры, ответы и квадраты на этом сервере будут заменены, гости сразу увидят
              новую версию.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              data-testid="import-confirm"
              onClick={() => pending && importQuiz.mutate({ quizId, file: pending.file })}
            >
              Заменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
