"use client";

import { useState } from "react";

/**
 * The signature element.
 *
 * A working scotoma test. The point isn't decoration — the product's whole
 * claim is that you can't perceive your own gaps, and this makes that claim
 * true on the visitor's own retina in about five seconds, before they've
 * uploaded anything. The payoff line only appears once they've actually seen
 * it happen, because the sentence lands differently after the demonstration
 * than before it.
 */
type Outcome = "confirmed" | "missed";

export function BlindSpotTest() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  return (
    <figure className="w-full border border-rule bg-surface p-6 sm:p-8">
      <figcaption className="eyebrow mb-5">Try it — 5 seconds</figcaption>

      {/*
        The separation is fixed, not `justify-between`. The scotoma sits about
        15° temporal, so the distance at which the dot vanishes is a function of
        this gap — d ≈ 3.7 × separation. Letting it float with the column width
        would change where the user has to sit for the test to work at all.
        15rem gives 219px centre to centre, putting that distance around 22cm,
        which is what "lean slowly toward the screen" is asking for — and it
        still fits inside a 375px viewport.
      */}
      <div
        className="mx-auto flex w-[15rem] items-center justify-between py-10 select-none"
        aria-hidden="true"
      >
        <span className="font-display text-3xl leading-none text-ink">✛</span>
        <span className="h-4 w-4 rounded-full bg-ink" />
      </div>

      <p className="font-mono text-xs leading-relaxed text-muted">
        Close your left eye. Look straight at the{" "}
        <span className="text-ink">✛</span> with your right eye. Keep looking at
        it, and lean slowly toward the screen.
      </p>

      {outcome === null ? (
        /*
          Two exits, because the thesis cannot be gated on the test working.
          It fails for anyone with one eye covered by circumstance, on a phone
          held too close, or who simply can't hold fixation — and those people
          still need the sentence the page is built around.
        */
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            type="button"
            onClick={() => setOutcome("confirmed")}
            className="font-mono text-xs text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
          >
            The dot disappeared →
          </button>
          <button
            type="button"
            onClick={() => setOutcome("missed")}
            className="font-mono text-xs text-muted underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            Couldn&apos;t get it to work
          </button>
        </div>
      ) : (
        <p className="animate-rise mt-5 border-t border-rule pt-5 font-body text-[0.95rem] leading-relaxed text-ink">
          {outcome === "confirmed" ? (
            <>
              You didn&apos;t see a hole where the dot was. Your brain filled the
              gap with more background — confidently, and without telling you.
              Your understanding of a subject does exactly the same thing, which
              is why re-reading your notes never finds it.
            </>
          ) : (
            <>
              It takes some fiddling with distance. But the effect is real: where
              the optic nerve leaves your retina there are no receptors, and your
              brain covers the hole with more background rather than reporting a
              gap — confidently, and without telling you. Your understanding of a
              subject does exactly the same thing, which is why re-reading your
              notes never finds it.
            </>
          )}
        </p>
      )}
    </figure>
  );
}
