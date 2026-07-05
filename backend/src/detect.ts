import type { Framework } from "./review-presets.js";
import type { ProfileName } from "./analyzers.js";

/**
 * FRAMEWORK / PARSER AUTO-DETECTION (§4.3).
 *
 * The UI no longer asks the user which framework they're in — it's inferred.
 * This keeps the interface clean and honest: the site takes JS-ecosystem code,
 * figures out what it is, and applies the matching parser + framework rules.
 *
 * Two signals, in priority order:
 *   1. The file extension (decisive for uploads: .vue → Vue, .svelte → Svelte).
 *   2. Content sniffing (for pasted code, which has no meaningful filename).
 *
 * Detection is a best-effort heuristic, NOT a parser. It only ever reads the
 * text with regexes to choose a profile + framework; it never executes anything
 * (§7.2). A wrong guess degrades gracefully: the worst case is a plain-JS parse
 * with no framework overlay, which still runs the chosen review type's rules.
 *
 * KNOWN LIMITATION: "React vs plain TS" can't always be told from a snippet.
 * We treat JSX or a use-Hook call as the React signal; without either, a paste
 * gets no framework overlay (just the review rules). That's the honest default.
 */

export interface Detection {
  /** Parser profile — which parser the worker should use. */
  profile: ProfileName;
  /** Framework whose rules to overlay, or null for none. */
  framework: Framework | null;
  /** Extension the worker should treat this as (drives the parser profile). */
  ext: string;
}

/** Does the text contain a JSX element inside a return (the React tell)? */
function hasJsx(code: string): boolean {
  return (
    /<[A-Za-z][A-Za-z0-9]*(\s[^>]*)?\/?>/.test(code) &&
    /\breturn\b[\s\S]*</.test(code)
  );
}

/**
 * Detect profile + framework from a validated extension and the code text.
 * `ext` is the validated extension from validate.ts (never user-free-text).
 */
export function detectFramework(code: string, ext: string): Detection {
  // 1. Decisive extensions (uploaded SFCs).
  if (ext === ".vue") return { profile: "vue", framework: "vue", ext };
  if (ext === ".svelte") return { profile: "svelte", framework: "svelte", ext };

  const c = code;

  // 2. Content sniffing. Order matters: most specific signals first.

  // Vue SFC pasted without a .vue name: a <template> plus a <script> block.
  if (/<template[\s>]/.test(c) && /<script[\s>]/.test(c)) {
    return { profile: "vue", framework: "vue", ext: ".vue" };
  }

  // Svelte pasted without a .svelte name: <script> plus Svelte-only syntax
  // ({#if}/{#each}/{#await}, reactive $:, on:click, {@html}).
  if (
    /<script[\s>]/.test(c) &&
    /(\{#(if|each|await)\b|\$:|\son:[a-z]+=|\{@html\b)/.test(c)
  ) {
    return { profile: "svelte", framework: "svelte", ext: ".svelte" };
  }

  // From here down everything is the JS/TS parser profile; only the framework
  // overlay differs. Keep `ext` as-is so JSX/TS parsing is preserved.

  // Next.js: imports from next/*.
  if (/from\s+['"]next\//.test(c) || /require\(\s*['"]next\//.test(c)) {
    return { profile: "js", framework: "next", ext };
  }

  // NestJS: @nestjs imports or its signature decorators.
  if (/from\s+['"]@nestjs\//.test(c) || /@(Controller|Module)\s*\(/.test(c)) {
    return { profile: "js", framework: "nest", ext };
  }

  // Angular: its decorators (and not NestJS, checked above).
  if (/@(Component|NgModule|Directive|Pipe)\s*\(/.test(c)) {
    return { profile: "js", framework: "angular", ext };
  }

  // Express: the express import/require.
  if (
    /from\s+['"]express['"]/.test(c) ||
    /require\(\s*['"]express['"]\s*\)/.test(c)
  ) {
    return { profile: "js", framework: "express", ext };
  }

  // React (covers Remix too — same rule family): a react import, a use-Hook
  // call, or JSX in a return.
  if (
    /from\s+['"]react['"]/.test(c) ||
    /\buse[A-Z]\w*\s*\(/.test(c) ||
    hasJsx(c)
  ) {
    return { profile: "js", framework: "react", ext };
  }

  // Plain Node: require(), node: imports, or module.exports.
  if (
    /\brequire\(/.test(c) ||
    /from\s+['"]node:/.test(c) ||
    /module\.exports\b/.test(c)
  ) {
    return { profile: "js", framework: "node", ext };
  }

  // Nothing framework-specific — plain JS/TS, review rules only.
  return { profile: "js", framework: null, ext };
}
