import type { AdminModule } from "../../client-types";
import { BirthdayEditor } from "./Editor";
import { BirthdayHostConsole } from "./HostConsole";
import { BirthdayPlayer } from "./Player";

export const birthdayAdminModule: AdminModule = {
  type: "birthday-guess",
  Player: BirthdayPlayer,
  HostConsole: BirthdayHostConsole,
  Editor: BirthdayEditor,
};
