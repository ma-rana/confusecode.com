/**
 * Client-side file handling for upload (§2.1, §6.5).
 *
 * IMPORTANT (§7.3): these checks are UX-only. The server is the real security
 * boundary and re-validates everything. We mirror its rules here so obviously
 * bad files are rejected instantly with a clear message, before any upload.
 *
 * We only ever READ a single text file's contents into the editor. We never
 * extract, unpack, or execute anything (§7.2).
 */

// Mirror of the server's CONFIG (backend/src/config.ts). Kept in sync by hand;
// the server is authoritative if they ever drift.
const ALLOWED_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
const MAX_BYTES = 1_000_000; // ~1 MB

/**
 * The editor language flavors the app offers. These are JS/TS-family only.
 * Monaco has just two relevant modes — "typescript" and "javascript" — and each
 * covers its JSX variant, so the flavor here also carries the extension we send
 * to the server for pasted code (which drives the analyzer's routing).
 */
export type EditorLanguage = "typescript" | "tsx" | "javascript" | "jsx";

/** Monaco editor mode for a given flavor. TSX rides the TS mode; JSX the JS mode. */
export function monacoMode(lang: EditorLanguage): "typescript" | "javascript" {
  return lang === "typescript" || lang === "tsx" ? "typescript" : "javascript";
}

/** Synthetic filename extension for pasted code in each flavor. */
export function pastedExt(lang: EditorLanguage): ".ts" | ".tsx" | ".js" | ".jsx" {
  switch (lang) {
    case "typescript":
      return ".ts";
    case "tsx":
      return ".tsx";
    case "javascript":
      return ".js";
    case "jsx":
      return ".jsx";
  }
}

/** Map an uploaded file's extension to the flavor that best represents it. */
function languageForExt(ext: string): EditorLanguage {
  switch (ext) {
    case ".tsx":
      return "tsx";
    case ".jsx":
      return "jsx";
    case ".ts":
      return "typescript";
    // .js, .mjs, .cjs → plain JavaScript mode.
    default:
      return "javascript";
  }
}

export interface FileReadOk {
  ok: true;
  filename: string;
  ext: string;
  code: string;
  /** Editor flavor derived from the extension — drives the editor's mode. */
  language: EditorLanguage;
}

export interface FileReadError {
  ok: false;
  error: string;
}

export type FileReadResult = FileReadOk | FileReadError;

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return name.slice(dot).toLowerCase();
}

/**
 * Validate and read ONE file. Rejects (without side effects) anything that isn't
 * a single allowed-extension text file within the size cap. Binary content is
 * caught by a null-byte scan, matching the server.
 */
export async function readCodeFile(file: File): Promise<FileReadResult> {
  const ext = extensionOf(file.name);
  if (ext === null || !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      error:
        "Only JavaScript/TypeScript files are supported (.js .jsx .ts .tsx .mjs .cjs).",
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `That file is too large (limit ${Math.round(MAX_BYTES / 1000)} KB).`,
    };
  }

  let code: string;
  try {
    code = await file.text();
  } catch {
    return { ok: false, error: "Could not read that file." };
  }

  if (code.length === 0) {
    return { ok: false, error: "That file is empty." };
  }

  // Binary / non-text guard (null byte is the cheapest tell, same as server).
  if (code.includes("\u0000")) {
    return { ok: false, error: "That looks like a binary file, not text." };
  }

  return {
    ok: true,
    filename: file.name,
    ext,
    code,
    language: languageForExt(ext),
  };
}

/**
 * Enforce "one file only" (§6.5). A drop or multi-select with more than one file
 * is rejected outright rather than silently picking one.
 */
export function pickSingleFile(files: FileList | null): File | { error: string } {
  if (!files || files.length === 0) {
    return { error: "No file selected." };
  }
  if (files.length > 1) {
    return { error: "Please add just one file at a time." };
  }
  return files[0]!;
}
