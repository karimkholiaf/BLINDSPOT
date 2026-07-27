"use client";

import { useEffect, useState } from "react";
import type { Assessment } from "@/lib/schemas";
import { VERDICT_DISPLAY } from "@/lib/verdict";

/*
  Assessment is the moment the product's claim is on the line, so the wait gets
  the diagnosis card's own chrome rather than a generic skeleton: same border,
  same eyebrow, same meter — an instrument mid-measurement, which then resolves
  in place into the real reading. The phases name what is actually being done,
  and the third one is the differentiator worth saying out loud.
*/
const CHECKING_STATES = [
  "Reading your explanation",
  "Checking it against the rubric",
  "Testing for false confidence",
];

export function DiagnosisPending() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setPhase((value) => Math.min(value + 1, CHECKING_STATES.length - 1)),
      2200,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <section role="status" className="animate-rise border border-rule bg-surface/60 p-6 sm:p-7">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="eyebrow">Measuring</p>
        <p aria-hidden="true" className="font-mono text-[0.7rem] text-muted/60">
          —<span>/100</span>
        </p>
      </header>

      <div aria-hidden="true" className="mt-3 h-1 w-full overflow-hidden bg-ink/8">
        <div className="animate-sweep h-full w-1/4 bg-muted" />
      </div>

      <p className="mt-5 font-display text-lg text-ink">
        {CHECKING_STATES[phase]}
        <span aria-hidden="true" className="animate-rec">
          …
        </span>
      </p>
    </section>
  );
}

function Points({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-2.5 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 font-body text-[0.9rem] leading-relaxed text-ink">
            <span aria-hidden="true" className={`mt-1 font-mono text-[0.6rem] ${tone}`}>
              ▪
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Diagnosis({ assessment }: { assessment: Assessment }) {
  const display = VERDICT_DISPLAY[assessment.verdict];
  const { misconception } = assessment;

  return (
    <section
      aria-label="Assessment"
      className={`animate-settle border ${display.border} ${display.tint} p-6 sm:p-7`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className={`font-mono text-xs tracking-[0.14em] uppercase ${display.color}`}>
          <span aria-hidden="true">{display.glyph}</span> {display.label}
        </p>
        <p className="font-mono text-[0.7rem] text-muted">
          {assessment.masteryScore}
          <span className="text-muted/60">/100</span>
        </p>
      </header>

      {/* Reads as a meter rather than a stray rule, which the hairline version did not. */}
      <div aria-hidden="true" className="mt-3 h-1 w-full bg-ink/8">
        <div
          className={`h-full ${display.bar}`}
          style={{ width: `${Math.max(2, Math.min(100, assessment.masteryScore))}%` }}
        />
      </div>

      <p className="mt-5 max-w-prose font-body text-[1.05rem] leading-relaxed text-ink">
        {assessment.headline}
      </p>

      {misconception && (
        <div className="mt-6 border-l-2 border-flag bg-surface py-5 pl-5 pr-5">
          <p className="eyebrow">The belief</p>
          <p className="mt-2 font-display text-xl leading-snug text-ink">{misconception.label}</p>

          <div className="mt-5 space-y-4 border-t border-rule pt-4">
            <div>
              <p className="eyebrow">You said</p>
              <blockquote className="mt-1.5 border-l border-rule pl-3 font-body text-[0.9rem] italic leading-relaxed text-muted">
                {misconception.whatYouSaid}
              </blockquote>
            </div>
            <div>
              <p className="eyebrow">Why that&apos;s wrong</p>
              <p className="mt-1.5 font-body text-[0.9rem] leading-relaxed text-ink">
                {misconception.whyItsWrong}
              </p>
            </div>
            <div>
              <p className="eyebrow">What&apos;s actually true</p>
              <p className="mt-1.5 font-body text-[0.9rem] leading-relaxed text-ink">
                {misconception.whatsActuallyTrue}
              </p>
            </div>
          </div>
        </div>
      )}

      {(assessment.gotRight.length > 0 || assessment.missed.length > 0) && (
        // Two columns only when both sides have content — otherwise a lone list
        // gets stranded in half the width and reads as a layout bug.
        <div
          className={`mt-6 grid gap-x-10 gap-y-6 border-t border-rule/70 pt-5 ${
            assessment.gotRight.length > 0 && assessment.missed.length > 0 ? "sm:grid-cols-2" : ""
          }`}
        >
          <Points title="You demonstrated" items={assessment.gotRight} tone="text-verified" />
          <Points title="Still missing" items={assessment.missed} tone="text-partial" />
        </div>
      )}

      <div className="mt-6 border-t border-rule/70 pt-5">
        <p className="eyebrow">Answer this next</p>
        <p className="mt-2 max-w-prose font-body text-[0.95rem] leading-relaxed text-ink">
          {assessment.followUpQuestion}
        </p>
      </div>
    </section>
  );
}
