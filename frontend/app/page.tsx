"use client";

import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { WorkLog } from "./components/WorkLog";
import { ProgressBar } from "./components/ProgressBar";
import { CompletionSummary } from "./components/CompletionSummary";
import { FileDrop } from "./components/FileDrop";
import { FileTabs } from "./components/FileTabs";
import {
  emptySession,
  foldAnalysis,
  markGotIt,
  progressOf,
  summarize,
  sessionFor,
  fileHasWork,
  type SessionsByType,
  type OpenFile,
} from "./session";
import type { FileReadOk, EditorLanguage } from "./file-upload";
import { monacoMode, pastedExt } from "./file-upload";
import type {
  AnalyzeResponse,
  ReviewTypeOption,
  ReviewTypesResponse,
} from "./types";

const STARTER = `// Paste your JavaScript or TypeScript here, or drop a file above.
// ConfuseCode finds issues and explains why they matter —
// then leaves the fixing to you.

function total(items) {
  let sum = 0;
  for (var i = 0; i <= items.length; i++) {
    sum += items[i].price;
  }
  return sum;
  console.log("done");
}
`;

type Status = "idle" | "analyzing" | "working" | "error";

// Display labels for auto-detected frameworks (server returns the lowercase id).
const DETECTED_LABELS: Record<string, string> = {
  react: "React",
  next: "Next.js",
  vue: "Vue.js",
  nuxt: "Nuxt.js",
  angular: "Angular",
  svelte: "Svelte / SvelteKit",
  node: "Node.js",
  express: "Express.js",
  nest: "NestJS",
  remix: "Remix",
};

// A monotonic id source for open files (names can repeat, ids never do).
let fileSeq = 0;
function nextFileId(): string {
  fileSeq += 1;
  return `file-${fileSeq}`;
}

// The synthetic filename for the built-in scratch tab. Used as BOTH the label
// shown on the tab/panel AND the sentinel the logic checks to recognise the
// untouched starter (so they can never drift apart).
const SCRATCH_NAME = "Example code";

// The starter/example scratch file every session opens with.
function starterFile(): OpenFile {
  return {
    fileId: nextFileId(),
    filename: SCRATCH_NAME,
    language: "tsx",
    code: STARTER,
    sessions: {},
    finished: false,
  };
}

export default function Home() {
  // The workspace: a list of open files, each with its OWN code + per-review-type
  // sessions. Switching files preserves everything; nothing is stored server-side.
  const [files, setFiles] = useState<OpenFile[]>(() => [starterFile()]);
  const [activeFileId, setActiveFileId] = useState<string>(() => files[0].fileId);

  const [reviewTypes, setReviewTypes] = useState<ReviewTypeOption[]>([]);
  const [reviewType, setReviewType] = useState<string>("bugs");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // What the server auto-detected from the last analysis, for a subtle UI note.
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/review-types")
      .then((r) => r.json() as Promise<ReviewTypesResponse>)
      .then((d) => {
        setReviewTypes(d.reviewTypes);
        setReviewType(d.default);
      })
      .catch(() => {});
  }, []);

  // ---- Active-file helpers ---------------------------------------------------

  const activeFile =
    files.find((f) => f.fileId === activeFileId) ?? files[0];
  const session = sessionFor(activeFile.sessions, reviewType);
  const inSession = session.revision > 0;
  // Whether the active file has been signed off with "Finish now". Per file, so
  // the completion summary follows the file you're viewing.
  const isFinished = activeFile.finished;

  // Update the active file immutably.
  function patchActiveFile(patch: Partial<OpenFile>) {
    setFiles((prev) =>
      prev.map((f) => (f.fileId === activeFileId ? { ...f, ...patch } : f)),
    );
  }

  // Update the active file's sessions map immutably.
  function patchActiveSessions(
    updater: (sessions: SessionsByType) => SessionsByType,
  ) {
    setFiles((prev) =>
      prev.map((f) =>
        f.fileId === activeFileId
          ? { ...f, sessions: updater(f.sessions) }
          : f,
      ),
    );
  }

  // ---- File open / switch ----------------------------------------------------

  // Open a validated upload as its OWN new tab, and focus it. Each file starts
  // with empty sessions — its work is independent of every other open file.
  function openFileInNewTab(file: FileReadOk) {
    const opened: OpenFile = {
      fileId: nextFileId(),
      filename: file.filename,
      language: file.language,
      code: file.code,
      sessions: {},
      finished: false,
    };
    setFiles((prev) => [...prev, opened]);
    setActiveFileId(opened.fileId);
    setStatus("idle");
    setErrorMsg("");
    setDetected(null);
  }

  // Replace the active file's contents in place (used when the untouched pasted
  // scratch tab is still empty of work — no point spawning a second blank tab).
  function replaceActiveFile(file: FileReadOk) {
    patchActiveFile({
      filename: file.filename,
      language: file.language,
      code: file.code,
      sessions: {},
      finished: false,
    });
    setStatus("idle");
    setErrorMsg("");
    setDetected(null);
  }

  function handleValidFile(file: FileReadOk) {
    setErrorMsg("");

    // If the current tab is the pristine example scratch (no work done, still
    // the starter), just load into it rather than opening a redundant blank tab.
    const isPristineScratch =
      activeFile.filename === SCRATCH_NAME && !fileHasWork(activeFile);

    if (isPristineScratch) {
      replaceActiveFile(file);
      return;
    }

    // Otherwise open it as a brand-new tab so existing work is never disturbed.
    openFileInNewTab(file);
  }

  function handleFileError(message: string) {
    // A bad file is rejected WITHOUT touching any open file.
    setErrorMsg(message);
  }

  // Switch which open file is active. Everything about the other files is kept.
  function handleSwitchFile(fileId: string) {
    if (fileId === activeFileId) return;
    setActiveFileId(fileId);
    setErrorMsg("");
    setDetected(null);
    // Show the newly-active file at whatever state its CURRENT review type is in.
    const target = files.find((f) => f.fileId === fileId);
    const s = target ? sessionFor(target.sessions, reviewType) : emptySession();
    setStatus(s.revision > 0 ? "working" : "idle");
  }

  // Close an open file. If it was active, fall back to a neighbour; never allow
  // zero tabs — closing the last one leaves a fresh scratch file.
  function handleCloseFile(fileId: string) {
    const remaining = files.filter((f) => f.fileId !== fileId);

    if (remaining.length === 0) {
      const fresh = starterFile();
      setFiles([fresh]);
      setActiveFileId(fresh.fileId);
      setStatus("idle");
      setErrorMsg("");
      setDetected(null);
      return;
    }

    setFiles(remaining);

    // Only need to move focus if we closed the file currently being viewed.
    if (fileId === activeFileId) {
      const fallback = remaining[remaining.length - 1];
      setActiveFileId(fallback.fileId);
      setErrorMsg("");
      setDetected(null);
      const s = sessionFor(fallback.sessions, reviewType);
      setStatus(s.revision > 0 ? "working" : "idle");
    }
  }

  // ---- Analyze + work-log actions -------------------------------------------

  async function runAnalyze() {
    setStatus("analyzing");
    setErrorMsg("");
    try {
      const sentName =
        activeFile.filename === SCRATCH_NAME
          ? `input${pastedExt(activeFile.language as EditorLanguage)}`
          : activeFile.filename;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: activeFile.code,
          filename: sentName,
          reviewType,
        }),
      });
      const data = (await res.json()) as AnalyzeResponse;

      if (!res.ok || "error" in data) {
        setErrorMsg(
          "error" in data ? data.error : "Something went wrong. Try again.",
        );
        setStatus("error");
        return;
      }

      patchActiveSessions((prev) => ({
        ...prev,
        [reviewType]: foldAnalysis(
          sessionFor(prev, reviewType),
          data.cards,
          reviewType,
        ),
      }));
      setDetected(data.framework);
      setStatus("working");
    } catch {
      setErrorMsg("Could not reach the analyzer. Check your connection.");
      setStatus("error");
    }
  }

  // Switching the review type swaps to that type's own work-log within the
  // active file. Each type keeps its issues independently.
  function handleReviewTypeChange(id: string) {
    if (id === reviewType) return;
    setReviewType(id);
    setErrorMsg("");
    setDetected(null);
    const target = sessionFor(activeFile.sessions, id);
    setStatus(target.revision > 0 ? "working" : "idle");
  }

  function handleGotIt(id: string) {
    patchActiveSessions((prev) => ({
      ...prev,
      [reviewType]: markGotIt(sessionFor(prev, reviewType), id),
    }));
  }

  function handleEditorChange(value: string | undefined) {
    patchActiveFile({ code: value ?? "" });
  }

  function handleFinish() {
    // Mark THIS file finished. Persists per file, so switching away and back
    // keeps the completion summary; the tab turns the success colour.
    patchActiveFile({ finished: true });
  }

  // "Keep working on this file" — clears only the active file's finished flag and
  // returns to its work-log. Other files and their completion state are untouched.
  function handleReset() {
    patchActiveFile({ finished: false });
    setStatus(inSession ? "working" : "idle");
  }

  const activeBlurb = reviewTypes.find((r) => r.id === reviewType)?.blurb;
  const progress = progressOf(session);

  return (
    <main className="page">
      <header className="masthead">
        <p className="masthead__eyebrow">Static code review · JS / TS</p>
        <h1 className="masthead__title">
          Learn debugging, <mark>not copy-pasting.</mark>
        </h1>
        <p className="masthead__creed">
          ConfuseCode reads your code, points out what&rsquo;s wrong, and
          explains why it matters. It never hands you the fix — finding the
          problem and solving it yourself is the whole point.
        </p>
        <span className="privacy-note">
          Your code is analyzed and never stored.
        </span>
      </header>

      {/* File tabs — one per open file, each with its own independent work.
         Shown even for a single file so the workspace strip is always present. */}
      {files.length > 0 && (
        <FileTabs
          files={files}
          activeFileId={activeFileId}
          onSwitch={handleSwitchFile}
          onClose={handleCloseFile}
        />
      )}

      {isFinished ? (
        <CompletionSummary summary={summarize(session)} onKeepGoing={handleReset} />
      ) : (
        <>
          <section className="workbench">
            <FileDrop onFile={handleValidFile} onError={handleFileError} />

            <p className="panel-label">
              <span>
                {activeFile.filename === SCRATCH_NAME
                  ? "Your code"
                  : activeFile.filename}
              </span>
              {inSession && (
                <span className="rev-badge">revision {session.revision}</span>
              )}
            </p>
            <div className="editor-frame">
              <Editor
                height="380px"
                language={monacoMode(activeFile.language as EditorLanguage)}
                path={activeFile.fileId}
                value={activeFile.code}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily:
                    '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace',
                  scrollBeyondLastLine: false,
                  padding: { top: 14, bottom: 14 },
                  renderLineHighlight: "line",
                  tabSize: 2,
                }}
              />
            </div>

            {reviewTypes.length > 0 && (
              <div className="review-picker" role="group" aria-label="Review type">
                <p className="panel-label">
                  <span>What kind of review?</span>
                </p>
                <div className="review-options">
                  {reviewTypes.map((rt) => {
                    const hasWork =
                      sessionFor(activeFile.sessions, rt.id).revision > 0;
                    return (
                      <button
                        key={rt.id}
                        className={`review-option ${
                          rt.id === reviewType ? "review-option--active" : ""
                        }`}
                        onClick={() => handleReviewTypeChange(rt.id)}
                        aria-pressed={rt.id === reviewType}
                      >
                        {rt.label}
                        {hasWork && (
                          <span
                            className="review-option__dot"
                            aria-label="has active session"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                {activeBlurb && <p className="review-blurb">{activeBlurb}</p>}
                {detected && DETECTED_LABELS[detected] && (
                  <p className="review-blurb">
                    Detected {DETECTED_LABELS[detected]} — framework-specific
                    checks were included.
                  </p>
                )}
              </div>
            )}

            <div className="toolbar">
              <button
                className="btn-analyze"
                onClick={runAnalyze}
                disabled={status === "analyzing"}
              >
                {status === "analyzing"
                  ? "Analyzing…"
                  : inSession
                    ? "Re-analyze"
                    : "Analyze"}
              </button>

              {inSession && (
                <button className="btn-finish" onClick={handleFinish}>
                  Finish now
                </button>
              )}
            </div>
          </section>

          {status === "error" && (
            <div className="notice notice--error" role="alert">
              {errorMsg}
            </div>
          )}

          {status === "idle" && !errorMsg && (
            <div className="empty-state">
              <strong>Nothing analyzed yet.</strong>
              Drop a file or paste code above, pick what kind of review you want,
              then press Analyze.
            </div>
          )}

          {inSession && status !== "analyzing" && (
            <>
              {progress.total > 0 && <ProgressBar progress={progress} />}
              <WorkLog issues={session.issues} onGotIt={handleGotIt} />
            </>
          )}
        </>
      )}

      <footer className="footer">
        ConfuseCode · a learning-focused reviewer. Findings come from static
        analysis — measured, not guessed. The fixes are yours to make.
      </footer>
    </main>
  );
}
