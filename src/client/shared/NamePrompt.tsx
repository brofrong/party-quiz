import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PLAYER_NAME_MAX } from "@/shared/player-name";
import { usePlayerName } from "./use-player-name";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the name is saved. */
  onSaved?: () => void;
};

/** "Как тебя зовут?" — asked once before a guest's first answer; also used to rename. */
export function NamePrompt({ open, onOpenChange, onSaved }: Props) {
  const player = usePlayerName();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setValue(player.name ?? "");
      setError(undefined);
    }
  }, [open, player.name]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = value.trim();
    if (!name) return setError("Напиши имя");
    try {
      await player.setName(name);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось сохранить");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Как тебя зовут?</DialogTitle>
            <DialogDescription>Имя увидят все в таблице очков.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            data-testid="name-input"
            value={value}
            maxLength={PLAYER_NAME_MAX}
            placeholder="Например, Петя"
            onChange={(e) => setValue(e.target.value)}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" data-testid="name-save" disabled={player.saving}>
              Готово
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
