// Host bundle: player, console and editor components.

import { birthdayAdminModule } from "./birthday-guess/client/admin-module";
import type { AdminModule } from "./client-types";
import { frameRevealAdminModule } from "./frame-reveal/client/admin-module";

const modules: AdminModule[] = [frameRevealAdminModule, birthdayAdminModule];
const byType = new Map(modules.map((m) => [m.type, m]));
export const getAdminModule = (type: string) => byType.get(type);
