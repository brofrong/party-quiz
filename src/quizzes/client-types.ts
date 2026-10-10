import type { ComponentType } from "react";

export type PlayerModule = { type: string; Player: ComponentType<{ view: unknown }> };

export type HostConsoleProps = {
  view: unknown;
  dispatch: (action: unknown) => void;
  busy: boolean;
  onReset: () => void;
};

export type EditorProps = {
  content: unknown;
  saving: boolean;
  onSave: (content: unknown) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
};

export type AdminModule = PlayerModule & {
  HostConsole: ComponentType<HostConsoleProps>;
  Editor: ComponentType<EditorProps>;
};
