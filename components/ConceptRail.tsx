"use client";

import type { Assessment, Concept } from "@/lib/schemas";
import { UNTESTED, VERDICT_DISPLAY } from "@/lib/verdict";

export function ConceptRail({
  concepts,
  results,
  activeId,
  onSelect,
}: {
  concepts: Concept[];
  results: Record<string, Assessment>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const tested = concepts.filter((concept) => results[concept.id]);
  const blindSpots = tested.filter((c) => results[c.id].verdict === "misconception").length;
  const solid = tested.filter((c) => results[c.id].verdict === "mastered").length;

  return (
    <nav aria-label="Concepts" className="flex h-full flex-col">
      <p className="eyebrow border-b border-rule pb-3">Concepts</p>

      <ul className="flex-1 divide-y divide-rule">
        {concepts.map((concept) => {
          const result = results[concept.id];
          const display = result ? VERDICT_DISPLAY[result.verdict] : UNTESTED;
          const active = concept.id === activeId;

          return (
            <li key={concept.id}>
              <button
                type="button"
                onClick={() => onSelect(concept.id)}
                aria-current={active ? "true" : undefined}
                className={`group flex w-full items-start gap-3 py-3.5 pr-2 text-left transition-colors ${
                  active ? "pl-3 -ml-3 bg-surface" : "hover:bg-surface/60"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 font-mono text-xs leading-5 ${display.color}`}
                >
                  {display.glyph}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-display text-[0.9rem] leading-snug ${
                      active ? "text-ink" : "text-ink/85"
                    }`}
                  >
                    {concept.title}
                  </span>
                  <span className={`mt-1 block font-mono text-[0.65rem] ${display.color}`}>
                    {display.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 border-t border-rule pt-4 font-mono text-[0.7rem] leading-relaxed text-muted">
        <p>
          {tested.length} of {concepts.length} explained
        </p>
        {tested.length > 0 && (
          <p className="mt-1">
            <span className="text-verified">{solid} solid</span>
            {" · "}
            <span className={blindSpots > 0 ? "text-flag" : ""}>
              {blindSpots} blind {blindSpots === 1 ? "spot" : "spots"}
            </span>
          </p>
        )}
      </div>
    </nav>
  );
}
