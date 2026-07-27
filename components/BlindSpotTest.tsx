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
export function BlindSpotTest() {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <figure className="w-full border border-rule bg-surface p-6 sm:p-8">
      <figcaption className="eyebrow mb-5">Try it — 5 seconds</figcaption>

      <div
        className="flex items-center justify-between px-2 py-10 select-none"
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

      {confirmed ? (
        <p className="mt-5 border-t border-rule pt-5 font-body text-[0.95rem] leading-relaxed text-ink animate-rise">
          You didn&apos;t see a hole where the dot was. Your brain filled the gap
          with more background — confidently, and without telling you. Your
          understanding of a subject does exactly the same thing, which is why
          re-reading your notes never finds it.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="mt-5 font-mono text-xs text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
        >
          The dot disappeared →
        </button>
      )}
    </figure>
  );
}
