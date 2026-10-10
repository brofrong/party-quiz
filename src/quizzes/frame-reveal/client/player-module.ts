import type { PlayerModule } from "../../client-types";
import { FrameRevealPlayer } from "./Player";

export const frameRevealPlayerModule: PlayerModule = {
  type: "frame-reveal",
  Player: FrameRevealPlayer,
};
