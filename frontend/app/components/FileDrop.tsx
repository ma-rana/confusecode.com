"use client";

import { useRef, useState } from "react";
import { readCodeFile, pickSingleFile, type FileReadOk } from "../file-upload";

/**
 * File picker + drag-and-drop (§2.1, §6.5). Reads ONE allowed text file and
 * hands its validated contents up to the parent, which decides what to do with
 * it (start fresh, re-analyze, or ask to switch). This component never touches
 * session state itself — it only reports a valid file or an error.
 */
export function FileDrop({
  onFile,
  onError,
}: {
  onFile: (file: FileReadOk) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    const picked = pickSingleFile(files);
    if ("error" in picked) {
      onError(picked.error);
      return;
    }
    const result = await readCodeFile(picked);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onFile(result);
  }

  return (
    <div
      className={`filedrop ${dragging ? "filedrop--over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".js,.jsx,.ts,.tsx,.mjs,.cjs"
        className="filedrop__input"
        onChange={(e) => {
          void handleFiles(e.target.files);
          // Reset so selecting the same file again still fires onChange.
          e.target.value = "";
        }}
      />
      <span className="filedrop__text">
        Drop a <strong>.js / .ts</strong> file here, or
      </span>
      <button
        type="button"
        className="filedrop__btn"
        onClick={() => inputRef.current?.click()}
      >
        choose a file
      </button>
    </div>
  );
}
