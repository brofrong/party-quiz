// Host bundle: player, console and editor components.
import type { AdminModule } from "./client-types";
import { frameRevealAdminModule } from "./frame-reveal/client/admin-module";

const modules: AdminModule[] = [frameRevealAdminModule];
const byType = new Map(modules.map((m) => [m.type, m]));
export const getAdminModule = (type: string) => byType.get(type);
