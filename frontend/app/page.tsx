"use client";

import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { WorkLog } from "./components/WorkLog";
import { ProgressBar } from "./components/ProgressBar";
import { CompletionSummary } from "./components/CompletionSummary";
import { FileDrop } from "./components/FileDrop";
import { ConfirmSwitch } from "./components/ConfirmSwitch";
import {
  emptySession,
  foldAnalysis,
  markGotIt,
  progressOf,
  summarize,
  type SessionState,
} from "./session";
import type { FileReadOk, EditorLanguage, Framework } from "./file-upload";
import {
  monacoMode,
  pastedExt,
  languageForFramework,
  frameworkForLanguage,
  FRAMEWORK_LABELS,
  FRAMEWORK_ORDER,
} from "./file-upload";
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

type Status = "idle" | "analyzing" | "working" | "finished" | "error";

export default function Home() {
  const [code, setCode] = useState<string>(STARTER);
  const [language, setLanguage] = useState<EditorLanguage>("tsx");
  // The framework the user selected in the picker. Drives `language` (and thus
  // the editor mode + file extension sent). React is a sensible default.
  const [framework, setFramework] = useState<Framework>("react");
  // The current file's display name. For pasted code we use a synthetic name.
  const [filename, setFilename] = useState<string>("pasted code");
  const [reviewTypes, setReviewTypes] = useState<ReviewTypeOption[]>([]);
  const [reviewType, setReviewType] = useState<string>("errors");
  const [session, setSession] = useState<SessionState>(emptySession());
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // A validated file waiting on the user's confirm to switch sessions (§6.5).
  const [pendingFile, setPendingFile] = useState<FileReadOk | null>(null);

  useEffect(() => {
    fetch("/api/review-types")
      .then((r) => r.json() as Promise<ReviewTypesResponse>)
      .then((d) => {
        setReviewTypes(d.reviewTypes);
        setReviewType(d.default);
      })
      .catch(() => {});
  }, []);

  const inSession = session.revision > 0;

  // Load a validated file's contents into the editor, starting fresh (§6.5).
  function loadFile(file: FileReadOk) {
    setCode(file.code);
    setLanguage(file.language);
    // Sync the framework picker to match the uploaded file's flavor.
    setFramework(frameworkForLanguage(file.language));
    setFilename(file.filename);
    setSession(emptySession());
    setStatus("idle");
    setErrorMsg("");
    setPendingFile(null);
  }

  // The §6.5 decision flow. The file is already validated by FileDrop.
  function handleValidFile(file: FileReadOk) {
    setErrorMsg("");

    // Same filename → just reload it, no session-clobber prompt needed.
    if (file.filename === filename) {
      loadFile(file);
      return;
    }

    // A different file, but no active session → load directly.
    if (!inSession) {
      loadFile(file);
      return;
    }

    // Different file mid-session → ask before clearing progress (§6.5, step 3).
    setPendingFile(file);
  }

  function handleFileError(message: string) {
    // A bad file is rejected WITHOUT touching the current session (§6.5).
    setErrorMsg(message);
  }

  async function runAnalyze() {
    setStatus("analyzing");
    setErrorMsg("");
    try {
      // For a real uploaded file we send its actual name (drives extension
      // routing server-side); for pasted code we send a synthetic name whose
      // extension matches the chosen flavor (e.g. input.tsx for TSX).
      const sentName =
        filename === "pasted code" ? `input${pastedExt(language)}` : filename;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, filename: sentName, reviewType, framework }),
      });
      const data = (await res.json()) as AnalyzeResponse;

      if (!res.ok || "error" in data) {
        setErrorMsg(
          "error" in data ? data.error : "Something went wrong. Try again.",
        );
        setStatus("error");
        return;
      }

      setSession((prev) => foldAnalysis(prev, data.cards));
      setStatus("working");
    } catch {
      setErrorMsg("Could not reach the analyzer. Check your connection.");
      setStatus("error");
    }
  }

  function handleGotIt(id: string) {
    setSession((prev) => markGotIt(prev, id));
  }

  function handleFinish() {
    setStatus("finished");
  }

  function handleReset() {
    setSession(emptySession());
    setStatus("idle");
  }

  // Picking a framework sets the editor flavor it maps to (React→tsx, Vue→vue,
  // etc.), which in turn drives the Monaco mode and the extension sent for
  // pasted code. The framework label is just the user-facing name for that flavor.
  function handleFrameworkChange(fw: Framework) {
    setFramework(fw);
    setLanguage(languageForFramework(fw));
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

      {status === "finished" ? (
        <CompletionSummary summary={summarize(session)} onKeepGoing={handleReset} />
      ) : (
        <>
          <section className="workbench">
            <FileDrop onFile={handleValidFile} onError={handleFileError} />

            <p className="panel-label">
              <span>{filename === "pasted code" ? "Your code" : filename}</span>
              {inSession && (
                <span className="rev-badge">revision {session.revision}</span>
              )}
            </p>
            <div className="editor-frame">
              <Editor
                height="380px"
                language={monacoMode(language)}
                value={code}
                onChange={(value) => setCode(value ?? "")}
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
                  {reviewTypes.map((rt) => (
                    <button
                      key={rt.id}
                      className={`review-option ${
                        rt.id === reviewType ? "review-option--active" : ""
                      }`}
                      onClick={() => setReviewType(rt.id)}
                      aria-pressed={rt.id === reviewType}
                    >
                      {rt.label}
                    </button>
                  ))}
                </div>
                {activeBlurb && <p className="review-blurb">{activeBlurb}</p>}
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

              <label className="lang-select-wrap">
                <select
                  className="lang-select"
                  value={framework}
                  onChange={(e) =>
                    handleFrameworkChange(e.target.value as Framework)
                  }
                  aria-label="Framework"
                >
                  {FRAMEWORK_ORDER.map((fw) => (
                    <option key={fw} value={fw}>
                      {FRAMEWORK_LABELS[fw]}
                    </option>
                  ))}
                </select>
              </label>

              <span className="toolbar__hint">
                {inSession
                  ? "Fix an issue in the editor, then re-analyze."
                  : "One file at a time. Edit and re-analyze as you go."}
              </span>
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

      {pendingFile && (
        <ConfirmSwitch
          currentName={filename}
          nextName={pendingFile.filename}
          onCancel={() => setPendingFile(null)}
          onConfirm={() => loadFile(pendingFile)}
        />
      )}

      <footer className="footer">
        ConfuseCode · a learning-focused reviewer. Findings come from static
        analysis — measured, not guessed. The fixes are yours to make.
      </footer>
    </main>
  );
}
