import { birthdayGuessModule } from "./birthday-guess/module";
import { frameRevealModule } from "./frame-reveal/module";
import type { AnyQuizModule } from "./types";

// Add new quiz types here (and in registry.player.ts / registry.admin.ts).
const modules: AnyQuizModule[] = [frameRevealModule, birthdayGuessModule];

export const quizModules: ReadonlyMap<string, AnyQuizModule> = new Map(
  modules.map((m) => [m.type, m]),
);

export function getQuizModule(type: string): AnyQuizModule {
  const m = quizModules.get(type);
  if (!m) throw new Error(`Unknown quiz type: ${type}`);
  return m;
}
