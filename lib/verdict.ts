import type { Verdict } from "./schemas";

/**
 * One place for the words and marks a verdict is shown with, so the rail, the
 * diagnosis card and the summary can never disagree about what a state is
 * called. The glyphs read as an instrument legend rather than as grades.
 */
export const VERDICT_DISPLAY: Record<
  Verdict,
  { label: string; glyph: string; color: string; tint: string; border: string }
> = {
  mastered: {
    label: "Solid",
    glyph: "●",
    color: "text-verified",
    tint: "bg-verified/8",
    border: "border-verified/35",
  },
  shaky: {
    label: "Thin in places",
    glyph: "◐",
    color: "text-partial",
    tint: "bg-partial/8",
    border: "border-partial/35",
  },
  misconception: {
    label: "Blind spot",
    glyph: "▲",
    color: "text-flag",
    tint: "bg-flag/8",
    border: "border-flag/40",
  },
  not_demonstrated: {
    label: "Not enough to go on",
    glyph: "○",
    color: "text-muted",
    tint: "bg-muted/8",
    border: "border-rule",
  },
};

export const UNTESTED = {
  label: "Untested",
  glyph: "○",
  color: "text-muted",
} as const;
