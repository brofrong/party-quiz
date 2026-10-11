import type { QuizModule } from "../types";
import {
  enabledQuestions,
  hostView,
  initialState,
  publicView,
  reduce,
  reducePlayer,
} from "./logic";
import {
  type BirthdayAction,
  type BirthdayContent,
  type BirthdayHostView,
  type BirthdayPlayerAction,
  type BirthdayPublicView,
  type BirthdayState,
  birthdayActionSchema,
  birthdayContentSchema,
  birthdayPlayerActionSchema,
  birthdayStateSchema,
} from "./schema";

export const birthdayGuessModule: QuizModule<
  BirthdayContent,
  BirthdayState,
  BirthdayAction,
  BirthdayPublicView,
  BirthdayHostView,
  BirthdayPlayerAction
> = {
  type: "birthday-guess",
  label: "Что ответит именинница",
  contentSchema: birthdayContentSchema,
  stateSchema: birthdayStateSchema,
  actionSchema: birthdayActionSchema,
  initialState,
  reduce,
  publicView,
  hostView,
  itemCount: (c) => enabledQuestions(c).length,
  playerActionSchema: birthdayPlayerActionSchema,
  reducePlayer,
};
