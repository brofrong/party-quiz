// Guest bundle: Player components only (no host/editor code).

import { birthdayPlayerModule } from "./birthday-guess/client/player-module";
import type { PlayerModule } from "./client-types";
import { frameRevealPlayerModule } from "./frame-reveal/client/player-module";

const modules: PlayerModule[] = [frameRevealPlayerModule, birthdayPlayerModule];
const byType = new Map(modules.map((m) => [m.type, m]));
export const getPlayerModule = (type: string) => byType.get(type);
