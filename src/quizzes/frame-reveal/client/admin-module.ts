import type { AdminModule } from "../../client-types";
import { FrameRevealEditor } from "./Editor";
import { FrameRevealHostConsole } from "./HostConsole";
import { FrameRevealPlayer } from "./Player";

export const frameRevealAdminModule: AdminModule = {
  type: "frame-reveal",
  Player: FrameRevealPlayer,
  HostConsole: FrameRevealHostConsole,
  Editor: FrameRevealEditor,
};
