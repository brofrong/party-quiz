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
import { Eraser, GripVertical, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaPicture } from "@/client/shared/MediaPicture";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EditorProps } from "../../client-types";
import type { FrameRevealContent, Slide } from "../schema";
import { RectEditor } from "./RectEditor";

export function FrameRevealEditor({ content, saving, onSave, onDirtyChange }: EditorProps) {
  const saved = content as FrameRevealContent;
  const [draft, setDraft] = useState(saved);
  const [selectedId, setSelectedId] = useState(saved.slides[0]?.id);
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

  const patch = (id: string, p: Partial<Slide>) =>
    setDraft((d) => ({ slides: d.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const from = d.slides.findIndex((s) => s.id === active.id);
      const to = d.slides.findIndex((s) => s.id === over.id);
      return { slides: arrayMove(d.slides, from, to) };
    });
  };

  const selected = draft.slides.find((s) => s.id === selectedId);
  const enabledCount = draft.slides.filter((s) => s.enabled).length;

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
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="gap-0 py-0">
          <CardHeader className="py-3">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Кадры · включено {enabledCount} из {draft.slides.length}
            </CardTitle>
          </CardHeader>
          <div className="h-[70vh] overflow-y-auto overflow-x-hidden">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={draft.slides.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1 p-2">
                  {draft.slides.map((s, i) => (
                    <SlideRow
                      key={s.id}
                      slide={s}
                      number={i + 1}
                      active={s.id === selectedId}
                      onSelect={() => setSelectedId(s.id)}
                      onToggle={(enabled) => patch(s.id, { enabled })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </Card>
        {selected && (
          <Card className="gap-0 py-0">
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="h-[55vh]">
                <RectEditor
                  media={selected.media}
                  rects={selected.rects}
                  onChange={(rects) => patch(selected.id, { rects })}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Тяни по картинке, чтобы нарисовать квадрат. Квадрат можно перетаскивать и тянуть за
                грани и углы.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="answer">Откуда</Label>
                  <Input
                    id="answer"
                    data-testid="editor-answer"
                    value={selected.answer}
                    onChange={(e) => patch(selected.id, { answer: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="hint">Что скрыто (покажется гостям при открытии)</Label>
                  <Input
                    id="hint"
                    value={selected.hint}
                    onChange={(e) => patch(selected.id, { hint: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                Квадратов: {selected.rects.length}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selected.rects.length}
                  onClick={() => patch(selected.id, { rects: [] })}
                >
                  <Eraser /> Стереть все
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

type RowProps = {
  slide: Slide;
  number: number;
  active: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
};

function SlideRow({ slide, number, active, onSelect, onToggle }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-1.5 pr-3",
        active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
        isDragging && "z-10 shadow-lg",
        !slide.enabled && "opacity-50",
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
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="block aspect-video w-20 shrink-0 overflow-hidden rounded">
          <MediaPicture media={slide.media} sizes="96px" className="h-full w-full object-cover" />
        </span>
        <span className="w-6 shrink-0 text-muted-foreground text-xs tabular-nums">{number}</span>
        <span className="truncate text-sm">{slide.answer}</span>
      </button>
      <Switch checked={slide.enabled} onCheckedChange={onToggle} aria-label="Показывать кадр" />
    </div>
  );
}
