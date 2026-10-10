import type { QuizModule } from "../types";
import { enabledSlides, hostView, initialState, publicView, reduce } from "./logic";
import {
  type FrameRevealAction,
  type FrameRevealContent,
  type FrameRevealHostView,
  type FrameRevealPublicView,
  type FrameRevealState,
  frameRevealActionSchema,
  frameRevealContentSchema,
  frameRevealStateSchema,
} from "./schema";

export const frameRevealModule: QuizModule<
  FrameRevealContent,
  FrameRevealState,
  FrameRevealAction,
  FrameRevealPublicView,
  FrameRevealHostView
> = {
  type: "frame-reveal",
  label: "Угадай кадр",
  contentSchema: frameRevealContentSchema,
  stateSchema: frameRevealStateSchema,
  actionSchema: frameRevealActionSchema,
  initialState: () => initialState(),
  reduce,
  publicView,
  hostView,
  itemCount: (c) => enabledSlides(c).length,
};
