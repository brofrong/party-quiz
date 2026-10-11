import type { PlayerModule } from "../../client-types";
import { BirthdayPlayer } from "./Player";

export const birthdayPlayerModule: PlayerModule = {
  type: "birthday-guess",
  Player: BirthdayPlayer,
};
