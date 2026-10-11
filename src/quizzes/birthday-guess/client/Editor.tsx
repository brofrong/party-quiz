import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EditorProps } from "../../client-types";
import { type BirthdayContent, DECOY_COUNT, type Question } from "../schema";

const newId = () => `q-${crypto.randomUUID().slice(0, 8)}`;

export function BirthdayEditor({ content, saving, onSave, onDirtyChange }: EditorProps) {
  const saved = content as BirthdayContent;
  const [draft, setDraft] = useState(saved);
  const [selectedId, setSelectedId] = useState(saved.questions[0]?.id);
  useEffect(() => setDraft(saved), [saved]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !saving) void onSave(draft);
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  });

  const patch = (id: string, p: Partial<Question>) =>
    setDraft((d) => ({ questions: d.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) }));
  const add = () => {
    const q: Question = {
      id: newId(),
      text: "",
      decoys: Array(DECOY_COUNT).fill(""),
      enabled: true,
    };
    setDraft((d) => ({ questions: [...d.questions, q] }));
    setSelectedId(q.id);
  };
  const remove = (id: string) => {
    const i = draft.questions.findIndex((q) => q.id === id);
    const rest = draft.questions.filter((q) => q.id !== id);
    setDraft({ questions: rest });
    setSelectedId(rest[Math.min(i, rest.length - 1)]?.id);
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const from = d.questions.findIndex((q) => q.id === active.id);
      const to = d.questions.findIndex((q) => q.id === over.id);
      return { questions: arrayMove(d.questions, from, to) };
    });
  };

  const selected = draft.questions.find((q) => q.id === selectedId);
  const enabledCount = draft.questions.filter((q) => q.enabled).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
            <Undo2 /> Отменить
          </Button>
          <Button
            data-testid="editor-save"
            disabled={!dirty || saving}
            onClick={() => onSave(draft)}
          >
            <Save /> Сохранить <kbd className="ml-1 text-xs opacity-60">⌘S</kbd>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center py-3">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Вопросы · включено {enabledCount} из {draft.questions.length}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              data-testid="bg-add-question"
              onClick={add}
            >
              <Plus /> Добавить
            </Button>
          </CardHeader>
          <div className="h-[70vh] overflow-y-auto overflow-x-hidden">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={draft.questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1 p-2">
                  {draft.questions.map((q, i) => (
                    <QuestionRow
                      key={q.id}
                      question={q}
                      number={i + 1}
                      active={q.id === selectedId}
                      onSelect={() => setSelectedId(q.id)}
                      onToggle={(enabled) => patch(q.id, { enabled })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </Card>
        {selected ? (
          <Card className="gap-0 self-start py-0">
            <CardContent className="flex flex-col gap-5 p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="bg-text">Вопрос</Label>
                <Input
                  id="bg-text"
                  data-testid="bg-editor-text"
                  value={selected.text}
                  placeholder="Например: любимое блюдо Ани?"
                  onChange={(e) => patch(selected.id, { text: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Ложные варианты</Label>
                <p className="text-muted-foreground text-xs">
                  Гостям покажем ответ Ани и первые 3 варианта. Четвёртый — запасной: если Аня
                  ответит так же, как один из вариантов, его заменит запасной.
                </p>
                {selected.decoys.map((d, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: decoys are fixed slots
                    key={i}
                    className="flex items-center gap-2"
                  >
                    <span className="w-20 shrink-0 text-muted-foreground text-xs">
                      {i < DECOY_COUNT - 1 ? `Вариант ${i + 1}` : "Запасной"}
                    </span>
                    <Input
                      data-testid={`bg-editor-decoy-${i}`}
                      value={d}
                      onChange={(e) =>
                        patch(selected.id, {
                          decoys: selected.decoys.map((x, j) => (j === i ? e.target.value : x)),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex">
                <Button
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={() =>
                    window.confirm(`Удалить вопрос «${selected.text || "без текста"}»?`) &&
                    remove(selected.id)
                  }
                >
                  <Trash2 /> Удалить вопрос
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-muted-foreground">Добавь первый вопрос</p>
        )}
      </div>
    </div>
  );
}

type RowProps = {
  question: Question;
  number: number;
  active: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
};

function QuestionRow({ question, number, active, onSelect, onToggle }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-1.5 pr-3",
        active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
        isDragging && "z-10 shadow-lg",
        !question.enabled && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-label="Перетащить"
        className="cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
      >
        <span className="w-6 shrink-0 text-muted-foreground text-xs tabular-nums">{number}</span>
        <span className="truncate text-sm">{question.text || "Новый вопрос"}</span>
      </button>
      <Switch
        checked={question.enabled}
        onCheckedChange={onToggle}
        aria-label="Показывать вопрос"
      />
    </div>
  );
}
