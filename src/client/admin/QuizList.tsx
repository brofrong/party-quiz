import { Pencil, Play, Radio } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/client/shared/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pluralRu } from "@/lib/plural";

type Props = { playingId?: string; onOpenConsole: () => void; onEdit: (quizId: string) => void };

export function QuizList({ playingId, onOpenConsole, onEdit }: Props) {
  const list = trpc.quiz.list.useQuery();
  const start = trpc.game.start.useMutation({
    onSuccess: onOpenConsole,
    onError: (e) => toast.error(e.message),
  });
  if (list.isPending) return <Skeleton className="h-40 w-full max-w-md" />;
  if (list.error) return <p className="text-destructive">{list.error.message}</p>;
  return (
    <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.data.map((q) => (
        <Card key={q.id}>
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              {q.typeLabel}
            </Badge>
            <CardTitle className="text-xl">{q.title}</CardTitle>
            <CardDescription>
              {q.itemCount} {pluralRu(q.itemCount, ["вопрос", "вопроса", "вопросов"])}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {playingId === q.id ? (
              <Button onClick={onOpenConsole}>
                <Radio /> Открыть пульт
              </Button>
            ) : (
              <Button
                data-testid={`start-${q.id}`}
                disabled={start.isPending}
                onClick={() => start.mutate({ quizId: q.id })}
              >
                <Play /> Запустить
              </Button>
            )}
            <Button variant="outline" onClick={() => onEdit(q.id)}>
              <Pencil /> Редактировать
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
