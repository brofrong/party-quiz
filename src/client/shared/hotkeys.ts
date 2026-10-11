/** Hotkeys must not fire while typing or while a dialog (e.g. "end game") has focus. */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
    t.closest('[role="dialog"], [role="alertdialog"]') !== null);
