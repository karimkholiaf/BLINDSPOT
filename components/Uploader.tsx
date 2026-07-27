"use client";

import { useRef, useState } from "react";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_UPLOAD,
  MAX_UPLOAD_BYTES,
  SAMPLE_PDF_PATH,
} from "@/lib/constants";

export type Source = { fileBase64?: string; text?: string; label: string };

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(blob);
  });
}

export function Uploader({
  onSource,
  busy,
}: {
  onSource: (source: Source) => void;
  busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function acceptFile(file: File | undefined) {
    setError(null);
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      // .doc gets its own message because "save it as .docx" is actionable and
      // "that's not a supported file" is not.
      setError(
        name.endsWith(".doc")
          ? "Word's older .doc format can't be read. Save it as .docx and try again."
          : "That needs to be a PDF or a Word (.docx) file. You can also paste the text instead.",
      );
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 3 MB. Try a single chapter.`,
      );
      return;
    }
    onSource({ fileBase64: await toBase64(file), label: file.name });
  }

  async function loadSample() {
    setError(null);
    try {
      const response = await fetch(SAMPLE_PDF_PATH);
      if (!response.ok) throw new Error();
      onSource({
        fileBase64: await toBase64(await response.blob()),
        label: "Lecture 4: Algorithmic Complexity",
      });
    } catch {
      setError("Couldn't load the sample lecture.");
    }
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void acceptFile(event.dataTransfer.files[0]);
        }}
        className={`border border-dashed p-8 text-center transition-colors ${
          dragging ? "border-ink bg-surface" : "border-rule bg-surface/60"
        }`}
      >
        <p className="font-body text-[0.95rem] text-ink">
          Drop a lecture here, or{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink disabled:opacity-50"
          >
            choose a file
          </button>
          .
        </p>
        <p className="mt-2 font-mono text-[0.7rem] text-muted">PDF or Word, up to 3 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_UPLOAD}
          className="sr-only"
          onChange={(event) => void acceptFile(event.target.files?.[0])}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadSample()}
          className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink disabled:opacity-50"
        >
          Use the sample lecture
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPasting((value) => !value)}
          className="text-muted underline decoration-rule underline-offset-4 transition-colors hover:text-ink disabled:opacity-50"
        >
          {pasting ? "Hide text box" : "Paste text instead"}
        </button>
      </div>

      {pasting && (
        <div className="mt-4 animate-rise">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            placeholder="Paste your lecture notes or a chapter of reading here."
            className="w-full resize-y border border-rule bg-surface p-4 font-body text-[0.95rem] leading-relaxed text-ink placeholder:text-muted/70"
          />
          <button
            type="button"
            disabled={busy || text.trim().length < 100}
            onClick={() => onSource({ text, label: "Pasted notes" })}
            className="mt-3 bg-ink px-5 py-2.5 font-mono text-xs tracking-wide text-field transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Build the map
          </button>
          {text.trim().length > 0 && text.trim().length < 100 && (
            <p className="mt-2 font-mono text-[0.7rem] text-muted">
              Needs a bit more — at least a couple of paragraphs.
            </p>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-flag bg-flag/5 py-2 pl-3 font-mono text-xs leading-relaxed text-ink"
        >
          {error}
        </p>
      )}
    </div>
  );
}
