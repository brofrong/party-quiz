import {
  type FrameRevealAction,
  type FrameRevealContent,
  type FrameRevealHostView,
  type FrameRevealPublicView,
  type FrameRevealState,
  REVEAL_ANIMATIONS,
  type RevealAnimation,
} from "./schema";

export const enabledSlides = (c: FrameRevealContent) => c.slides.filter((s) => s.enabled);

const clamp = (i: number, total: number) => (total === 0 ? 0 : Math.min(Math.max(i, 0), total - 1));

export const initialState = (): FrameRevealState => ({
  index: 0,
  phase: "hidden",
  animation: "dissolve",
});

export function pickAnimation(rng: () => number): RevealAnimation {
  const i = Math.min(Math.floor(rng() * REVEAL_ANIMATIONS.length), REVEAL_ANIMATIONS.length - 1);
  return REVEAL_ANIMATIONS[i] as RevealAnimation;
}

export function reduce(
  content: FrameRevealContent,
  state: FrameRevealState,
  action: FrameRevealAction,
  rng: () => number,
): FrameRevealState {
  const total = enabledSlides(content).length;
  const index = clamp(state.index, total);
  switch (action.type) {
    case "next":
      return index + 1 < total
        ? { ...state, index: index + 1, phase: "hidden" }
        : { ...state, index };
    case "prev":
      return index > 0 ? { ...state, index: index - 1, phase: "hidden" } : { ...state, index };
    case "goto": {
      const target = clamp(action.index, total);
      return target === index ? { ...state, index } : { ...state, index: target, phase: "hidden" };
    }
    case "reveal":
      return {
        ...state,
        index,
        phase: "revealed",
        animation: action.animation === "random" ? pickAnimation(rng) : action.animation,
      };
    case "hide":
      return { ...state, index, phase: "hidden" };
  }
}

export function publicView(
  content: FrameRevealContent,
  state: FrameRevealState,
): FrameRevealPublicView {
  const slides = enabledSlides(content);
  const total = slides.length;
  const index = clamp(state.index, total);
  const current = slides[index];
  if (!current) {
    return {
      index: 0,
      total: 0,
      slide: null,
      phase: "hidden",
      animation: state.animation,
      answer: null,
      preload: [],
    };
  }
  return {
    index,
    total,
    slide: { id: current.id, media: current.media, rects: current.rects },
    phase: state.phase,
    animation: state.animation,
    answer: state.phase === "revealed" ? current.answer : null,
    preload: slides.slice(index + 1, index + 3).map((s) => s.media),
  };
}

export function hostView(
  content: FrameRevealContent,
  state: FrameRevealState,
): FrameRevealHostView {
  const view = publicView(content, state);
  const slides = enabledSlides(content);
  const current = view.slide ? slides[view.index] : undefined;
  return {
    ...view,
    currentAnswer: current?.answer ?? null,
    currentHint: current?.hint ?? null,
    slides: slides.map((s) => ({ id: s.id, media: s.media, answer: s.answer })),
  };
}
