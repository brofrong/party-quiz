import {
  type FrameRevealAction,
  type FrameRevealContent,
  type FrameRevealHostView,
  type FrameRevealPublicView,
  type FrameRevealState,
  REVEAL_ANIMATIONS,
  type RevealAnimation,
  type Slide,
} from "./schema";

export const enabledSlides = (c: FrameRevealContent) => c.slides.filter((s) => s.enabled);

const clamp = (i: number, total: number) => (total === 0 ? 0 : Math.min(Math.max(i, 0), total - 1));

export const initialState = (content?: FrameRevealContent): FrameRevealState => ({
  index: 0,
  slideId: content ? (enabledSlides(content)[0]?.id ?? null) : null,
  phase: "hidden",
  animation: "dissolve",
});

export function pickAnimation(rng: () => number): RevealAnimation {
  const i = Math.min(Math.floor(rng() * REVEAL_ANIMATIONS.length), REVEAL_ANIMATIONS.length - 1);
  return REVEAL_ANIMATIONS[i] as RevealAnimation;
}

type Located = { slides: Slide[]; index: number; phase: FrameRevealState["phase"] };

/**
 * Where the state points after content edits: the remembered slide is followed by id.
 * If it is gone, the slide now at that position was never revealed, so it is shown covered.
 */
function locate(content: FrameRevealContent, state: FrameRevealState): Located {
  const slides = enabledSlides(content);
  const byId = state.slideId ? slides.findIndex((s) => s.id === state.slideId) : -1;
  if (byId >= 0) return { slides, index: byId, phase: state.phase };
  return { slides, index: clamp(state.index, slides.length), phase: "hidden" };
}

const at = (
  { slides }: Located,
  index: number,
  phase: FrameRevealState["phase"],
  animation: RevealAnimation,
): FrameRevealState => ({ index, slideId: slides[index]?.id ?? null, phase, animation });

export function reduce(
  content: FrameRevealContent,
  state: FrameRevealState,
  action: FrameRevealAction,
  rng: () => number,
): FrameRevealState {
  const loc = locate(content, state);
  const total = loc.slides.length;
  const stay = at(loc, loc.index, loc.phase, state.animation);
  switch (action.type) {
    case "next":
      return loc.index + 1 < total ? at(loc, loc.index + 1, "hidden", state.animation) : stay;
    case "prev":
      return loc.index > 0 ? at(loc, loc.index - 1, "hidden", state.animation) : stay;
    case "goto": {
      const target = clamp(action.index, total);
      return target === loc.index ? stay : at(loc, target, "hidden", state.animation);
    }
    case "reveal":
      // Nothing to reveal, or already revealed (double key press): keep the running animation.
      if (total === 0 || loc.phase === "revealed") return stay;
      return at(
        loc,
        loc.index,
        "revealed",
        action.animation === "random" ? pickAnimation(rng) : action.animation,
      );
    case "hide":
      return at(loc, loc.index, "hidden", state.animation);
  }
}

export function publicView(
  content: FrameRevealContent,
  state: FrameRevealState,
): FrameRevealPublicView {
  const { slides, index, phase } = locate(content, state);
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
    total: slides.length,
    slide: { id: current.id, media: current.media, rects: current.rects },
    phase,
    animation: state.animation,
    answer: phase === "revealed" ? current.answer : null,
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
