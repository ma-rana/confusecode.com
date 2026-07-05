"use client";

import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { WorkLog } from "./components/WorkLog";
import { ProgressBar } from "./components/ProgressBar";
import { CompletionSummary } from "./components/CompletionSummary";
import {
  emptySession,
  foldAnalysis,
  markGotIt,
  progressOf,
  summarize,
  type SessionState,
} from "./session";
import type {
  AnalyzeResponse,
  ReviewTypeOption,
  ReviewTypesResponse,
} from "./types";

const STARTER = `// Paste your JavaScript or TypeScript here.
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
  const [language, setLanguage] = useState<"typescript" | "javascript">(
    "typescript",
  );
  const [reviewTypes, setReviewTypes] = useState<ReviewTypeOption[]>([]);
  const [reviewType, setReviewType] = useState<string>("errors");
  const [session, setSession] = useState<SessionState>(emptySession());
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    fetch("/api/review-types")
      .then((r) => r.json() as Promise<ReviewTypesResponse>)
      .then((d) => {
        setReviewTypes(d.reviewTypes);
        setReviewType(d.default);
      })
      .catch(() => {});
  }, []);

  async function runAnalyze() {
    setStatus("analyzing");
    setErrorMsg("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          filename: language === "typescript" ? "input.ts" : "input.js",
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

      // Fold this analysis into the running work-log (§6.4).
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
    // Explicit, non-destructive-by-accident: starting fresh clears the log.
    setSession(emptySession());
    setStatus("idle");
  }

  const activeBlurb = reviewTypes.find((r) => r.id === reviewType)?.blurb;
  const progress = progressOf(session);
  const inSession = session.revision > 0;

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
            <p className="panel-label">
              <span>Your code</span>
              {inSession && (
                <span className="rev-badge">revision {session.revision}</span>
              )}
            </p>
            <div className="editor-frame">
              <Editor
                height="380px"
                language={language}
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
                  value={language}
                  onChange={(e) =>
                    setLanguage(e.target.value as "typescript" | "javascript")
                  }
                  aria-label="Language"
                >
                  <option value="typescript">TypeScript</option>
                  <option value="javascript">JavaScript</option>
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

          {status === "idle" && (
            <div className="empty-state">
              <strong>Nothing analyzed yet.</strong>
              Write or paste some JavaScript or TypeScript above, pick what kind
              of review you want, then press Analyze.
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
