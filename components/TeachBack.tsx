"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Concept } from "@/lib/schemas";

const MIN_LENGTH = 15;

/*
  Speech support is a browser capability, not React state — reading it in an
  effect would render the button wrong for one frame. useSyncExternalStore
  gives the server `false` and the client the real answer with no mismatch.
  Support can't change during a session, so the subscribe function is a no-op.
*/
const subscribe = () => () => {};
const hasSpeechSupport = () =>
  Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
const hasSpeechSupportOnServer = () => false;

export function TeachBack({
  concept,
  value,
  onChange,
  onSubmit,
  busy,
}: {
  concept: Concept;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const supported = useSyncExternalStore(subscribe, hasSpeechSupport, hasSpeechSupportOnServer);

  const recognition = useRef<SpeechRecognitionInstance | null>(null);
  const committed = useRef("");

  // Dictation is per-concept; carrying a live session across a switch would
  // append one concept's words onto another's explanation.
  useEffect(() => {
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, [concept.id]);

  function stopListening() {
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
    setInterim("");
  }

  function startListening() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    setVoiceError(null);
    const instance = new Recognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";

    committed.current = value ? `${value.trimEnd()} ` : "";

    instance.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          committed.current += text.trim() + " ";
        } else {
          pending += text;
        }
      }
      setInterim(pending);
      onChange(committed.current + pending);
    };

    instance.onerror = (event) => {
      setVoiceError(
        event.error === "not-allowed"
          ? "Microphone access was blocked. Allow it in your browser, or type instead."
          : "Dictation stopped unexpectedly. You can keep typing.",
      );
      setListening(false);
      setInterim("");
    };

    instance.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognition.current = instance;
    instance.start();
    setListening(true);
  }

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const tooShort = value.trim().length < MIN_LENGTH;

  return (
    <section aria-labelledby="teachback-heading">
      <p className="eyebrow">Teach it back</p>
      <h2 id="teachback-heading" className="mt-2 font-display text-2xl leading-tight text-ink">
        {concept.title}
      </h2>
      <p className="mt-3 max-w-prose font-body text-[0.95rem] leading-relaxed text-muted">
        Explain it in your own words, as if to someone who has never seen it. Don&apos;t look at
        your notes — the point is what you can reconstruct, not what you can copy.
      </p>

      <div className="relative mt-6">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={busy}
          rows={9}
          placeholder="Start explaining…"
          className="w-full resize-y border border-rule bg-surface p-4 font-body text-[1rem] leading-relaxed text-ink placeholder:text-muted/60 disabled:opacity-60"
        />
        {listening && (
          <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 bg-surface/90 px-2 py-1 font-mono text-[0.65rem] text-ink">
            <span aria-hidden="true" className="animate-rec h-1.5 w-1.5 rounded-full bg-ink" />
            Listening
          </span>
        )}
      </div>

      {interim && (
        <p className="mt-2 font-body text-sm italic leading-relaxed text-muted">…{interim}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {supported && (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={busy}
            className={`border px-4 py-2.5 font-mono text-xs tracking-wide transition-colors disabled:opacity-40 ${
              listening
                ? "border-ink bg-ink text-field"
                : "border-rule bg-surface text-ink hover:border-ink"
            }`}
          >
            {listening ? "Stop dictating" : "Explain out loud"}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (listening) stopListening();
            onSubmit();
          }}
          disabled={busy || tooShort}
          className="bg-ink px-5 py-2.5 font-mono text-xs tracking-wide text-field transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Check my understanding"}
        </button>

        <span className="font-mono text-[0.7rem] text-muted">
          {words === 0 ? "" : `${words} ${words === 1 ? "word" : "words"}`}
        </span>
      </div>

      {!supported && (
        <p className="mt-3 font-mono text-[0.7rem] text-muted">
          Dictation needs Chrome or Edge. Typing works everywhere.
        </p>
      )}

      {voiceError && (
        <p role="alert" className="mt-3 font-mono text-[0.7rem] leading-relaxed text-ink">
          {voiceError}
        </p>
      )}
    </section>
  );
}
