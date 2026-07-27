"use client";

import { useEffect, useState } from "react";
import { BlindSpotTest } from "@/components/BlindSpotTest";
import { ConceptRail } from "@/components/ConceptRail";
import { Diagnosis } from "@/components/Diagnosis";
import { TeachBack } from "@/components/TeachBack";
import { Uploader, type Source } from "@/components/Uploader";
import type { Assessment, ConceptMap } from "@/lib/schemas";

const READING_STATES = [
  "Reading the material",
  "Pulling out the concepts",
  "Writing a rubric for each one",
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Request failed.");
  return data as T;
}

export default function Home() {
  const [map, setMap] = useState<ConceptMap | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Assessment>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!extracting) return;
    const timer = setInterval(
      () => setPhase((value) => Math.min(value + 1, READING_STATES.length - 1)),
      2600,
    );
    return () => clearInterval(timer);
  }, [extracting]);

  async function handleSource(source: Source) {
    setPhase(0);
    setExtracting(true);
    setError(null);
    setSourceLabel(source.label);
    try {
      const result = await postJson<ConceptMap>("/api/extract", {
        pdfBase64: source.pdfBase64,
        text: source.text,
      });
      setMap(result);
      setActiveId(result.concepts[0]?.id ?? null);
      setResults({});
      setDrafts({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that material.");
      setSourceLabel(null);
    } finally {
      setExtracting(false);
    }
  }

  async function handleAssess() {
    const concept = map?.concepts.find((item) => item.id === activeId);
    if (!concept) return;

    setAssessing(true);
    setError(null);
    try {
      const assessment = await postJson<Assessment>("/api/assess", {
        concept,
        explanation: drafts[concept.id] ?? "",
      });
      setResults((current) => ({ ...current, [concept.id]: assessment }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't assess that.");
    } finally {
      setAssessing(false);
    }
  }

  const activeConcept = map?.concepts.find((concept) => concept.id === activeId) ?? null;

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-baseline justify-between border-b border-rule py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-base font-bold tracking-[0.16em] text-ink">
            BLINDSPOT
          </span>
          <span className="hidden font-mono text-[0.7rem] text-muted sm:inline">
            you don&apos;t know it until you can teach it
          </span>
        </div>
        {map && (
          <button
            type="button"
            onClick={() => {
              setMap(null);
              setResults({});
              setDrafts({});
              setActiveId(null);
              setSourceLabel(null);
              setError(null);
            }}
            className="font-mono text-xs text-muted underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            New material
          </button>
        )}
      </header>

      <main className="flex-1 py-10 sm:py-14">
        {!map ? (
          <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
            <div>
              <h1 className="max-w-xl font-display text-[2rem] leading-[1.15] tracking-tight text-ink sm:text-[2.6rem]">
                Your brain fills your blind spot with something plausible.
              </h1>
              <p className="mt-4 max-w-xl font-body text-[1.35rem] italic leading-snug text-muted">
                So does your understanding.
              </p>

              <p className="mt-7 max-w-lg font-body text-[1rem] leading-relaxed text-ink">
                Re-reading your notes can&apos;t find what you almost know. Explaining can. Upload a
                lecture, teach each idea back in your own words, and Blindspot names the specific
                thing you have wrong — not just the questions you missed.
              </p>

              <div className="mt-9">
                {extracting ? (
                  <div className="border border-rule bg-surface p-8">
                    <p className="eyebrow">{sourceLabel}</p>
                    <p className="mt-3 font-display text-lg text-ink">
                      {READING_STATES[phase]}
                      <span className="animate-rec">…</span>
                    </p>
                    <p className="mt-2 font-mono text-[0.7rem] text-muted">
                      Usually 15–30 seconds.
                    </p>
                  </div>
                ) : (
                  <Uploader onSource={handleSource} busy={extracting} />
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-5 max-w-lg border-l-2 border-flag bg-flag/5 py-2.5 pl-3 font-mono text-xs leading-relaxed text-ink"
                >
                  {error}
                </p>
              )}
            </div>

            <div className="lg:pt-2">
              <BlindSpotTest />

              {/* Three steps because there are three; the numbering encodes a real
                  sequence rather than decorating the column. */}
              <ol className="mt-8 divide-y divide-rule border-t border-rule">
                {[
                  ["Upload", "It reads your lecture and pulls out the concepts, writing a rubric for each."],
                  ["Explain", "You teach each concept back, typed or out loud, without looking."],
                  ["Diagnose", "It separates what you half-know from what you have actively wrong."],
                ].map(([step, detail], index) => (
                  <li key={step} className="flex gap-4 py-3.5">
                    <span className="font-mono text-[0.7rem] leading-6 text-muted">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-sm text-ink">{step}</span>
                      <span className="mt-0.5 block font-body text-[0.85rem] leading-relaxed text-muted">
                        {detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-14">
            <aside className="lg:sticky lg:top-8 lg:self-start">
              <ConceptRail
                concepts={map.concepts}
                results={results}
                activeId={activeId}
                onSelect={(id) => setActiveId(id)}
              />
            </aside>

            <div className="min-w-0 max-w-3xl">
              <p className="eyebrow mb-8">{map.sourceTitle}</p>

              {activeConcept && (
                <>
                  <TeachBack
                    key={activeConcept.id}
                    concept={activeConcept}
                    value={drafts[activeConcept.id] ?? ""}
                    onChange={(value) =>
                      setDrafts((current) => ({ ...current, [activeConcept.id]: value }))
                    }
                    onSubmit={handleAssess}
                    busy={assessing}
                  />

                  {error && (
                    <p
                      role="alert"
                      className="mt-5 border-l-2 border-flag bg-flag/5 py-2.5 pl-3 font-mono text-xs leading-relaxed text-ink"
                    >
                      {error}
                    </p>
                  )}

                  {assessing && (
                    <p className="mt-8 font-mono text-xs text-muted">
                      Comparing your explanation against the material
                      <span className="animate-rec">…</span>
                    </p>
                  )}

                  {!assessing && results[activeConcept.id] && (
                    <div className="mt-8">
                      <Diagnosis assessment={results[activeConcept.id]} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-rule py-5 font-mono text-[0.7rem] text-muted">
        Built for the Prometheus July AI Challenge · Concept extraction and assessment by Gemini
      </footer>
    </div>
  );
}
