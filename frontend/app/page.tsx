"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Findings } from "./components/Findings";
import type { AnalyzeResponse, Finding } from "./types";

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

type Status = "idle" | "analyzing" | "done" | "error";

export default function Home() {
  const [code, setCode] = useState<string>(STARTER);
  const [language, setLanguage] = useState<"typescript" | "javascript">(
    "typescript",
  );
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

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
        }),
      });
      const data = (await res.json()) as AnalyzeResponse;

      if (!res.ok || "error" in data) {
        setErrorMsg(
          "error" in data ? data.error : "Something went wrong. Try again.",
        );
        setFindings([]);
        setStatus("error");
        return;
      }

      setFindings(data.findings);
      setStatus("done");
    } catch {
      setErrorMsg("Could not reach the analyzer. Check your connection.");
      setStatus("error");
    }
  }

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

      <section className="workbench">
        <p className="panel-label">
          <span>Your code</span>
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

        <div className="toolbar">
          <button
            className="btn-analyze"
            onClick={runAnalyze}
            disabled={status === "analyzing"}
          >
            {status === "analyzing" ? "Analyzing…" : "Analyze"}
          </button>

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
            One file at a time. Edit and re-analyze as you go.
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
          Write or paste some JavaScript or TypeScript above, then press Analyze
          to see what a careful reviewer would flag.
        </div>
      )}

      {status === "done" && <Findings findings={findings} />}

      <footer className="footer">
        ConfuseCode · a learning-focused reviewer. Findings come from static
        analysis — measured, not guessed. The fixes are yours to make.
      </footer>
    </main>
  );
}
