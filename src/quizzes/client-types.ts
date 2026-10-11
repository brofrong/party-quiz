import type { ComponentType } from "react";

export type PlayerProps = {
  view: unknown;
  /** Sends a guest action (e.g. a vote). Absent in the host's preview. */
  act?: (action: unknown) => void;
};

export type PlayerModule = { type: string; Player: ComponentType<PlayerProps> };

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
