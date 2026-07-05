import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";
import svelteParser from "svelte-eslint-parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import nPlugin from "eslint-plugin-n";
import vuePlugin from "eslint-plugin-vue";
import sveltePlugin from "eslint-plugin-svelte";
import type { Linter } from "eslint";

/**
 * ANALYZER PROFILES — the parser/plugin wiring per file family (§4.3).
 *
 * The original design had one hardcoded parser (typescript-eslint) because v1
 * only did JS/TS. Supporting Vue and Svelte means their single-file component
 * formats (.vue, .svelte) need their OWN parsers — typescript-eslint cannot
 * read them. So the worker can no longer assume one parser; it picks a profile
 * by extension and builds the matching flat-config for Linter.verify.
 *
 * NON-NEGOTIABLE (§7.2) still holds: every parser here is PARSE-ONLY. None of
 * them execute submitted code. Each is, however, its own attack surface, which
 * is exactly why the worker runs under the parent's wall-clock timeout (§7.4).
 *
 * Two ESLint-9 flat-config facts this module encodes:
 *  1. Plugin rules must be provided via `plugins` (not defineRule, which is
 *     disabled in flat mode) and referenced by namespaced id.
 *  2. When a filename is passed to verify(), the config MUST carry a `files`
 *     matcher that matches it — otherwise ESLint reports "no matching
 *     configuration". So every profile sets `files` and a matching filename.
 *
 * Non-JS parsers (Vue/Svelte) need the framework's own compiler installed as a
 * peer (vue / svelte in package.json) — the parser imports it to build the AST.
 */

export type ProfileName = "js" | "vue" | "svelte";

/**
 * Globals so common runtime names aren't false-flagged by no-undef. Covers both
 * browser and Node names, since submissions can be either (frontend components
 * or Express/Nest server code).
 */
const COMMON_GLOBALS: Linter.Globals = {
  console: "readonly",
  process: "readonly",
  window: "readonly",
  document: "readonly",
  fetch: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  queueMicrotask: "readonly",
  structuredClone: "readonly",
  Promise: "readonly",
  Math: "readonly",
  JSON: "readonly",
  Object: "readonly",
  Array: "readonly",
  // Node globals — Express / Nest / plain Node submissions rely on these.
  module: "readonly",
  require: "readonly",
  exports: "writable",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  global: "readonly",
};

/**
 * A profile knows how to (a) name the synthetic file it's linting so ESLint
 * applies the right context, and (b) build the flat-config for a given rule set.
 */
export interface AnalyzerProfile {
  /** Synthetic filename passed to verify() so the `files` matcher matches. */
  filenameFor(ext: string): string;
  /** Build the flat-config object handed to Linter.verify. */
  build(rules: Linter.RulesRecord): Linter.Config;
}

// Cast plugins to the loose shape flat-config expects; upstream types vary.
type PluginMap = NonNullable<Linter.Config["plugins"]>;
const asPlugins = (p: Record<string, unknown>): PluginMap => p as PluginMap;

const PROFILES: Record<ProfileName, AnalyzerProfile> = {
  // JS/TS/JSX/TSX + Node. One parser (typescript-eslint) covers all of these,
  // including JSX. React, Next, and Node plugins ride here; a preset only
  // activates the ones it names, so listing all is harmless.
  js: {
    filenameFor: (ext) => `input${ext}`,
    build: (rules) => ({
      files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.cjs"],
      plugins: asPlugins({
        react: reactPlugin,
        "react-hooks": reactHooksPlugin,
        "@next/next": nextPlugin,
        n: nPlugin,
      }),
      // React plugin reads settings.react.version; "detect" needs the real
      // package installed in the analyzed project, which we don't have (we only
      // parse a snippet), so pin a modern version to silence the warning.
      settings: { react: { version: "18.0" } },
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        parser: tsParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
        globals: COMMON_GLOBALS,
      },
      rules,
    }),
  },

  // Vue single-file components. vue-eslint-parser parses <template> + <script>;
  // typescript-eslint is nested in for the <script lang="ts"> block.
  vue: {
    filenameFor: () => "Component.vue",
    build: (rules) => ({
      files: ["**/*.vue"],
      plugins: asPlugins({ vue: vuePlugin }),
      languageOptions: {
        parser: vueParser,
        ecmaVersion: 2022,
        sourceType: "module",
        parserOptions: { parser: tsParser },
        globals: COMMON_GLOBALS,
      },
      rules,
    }),
  },

  // Svelte components. svelte-eslint-parser needs the `svelte` compiler present
  // as a peer dependency to build its AST.
  svelte: {
    filenameFor: () => "Component.svelte",
    build: (rules) => ({
      files: ["**/*.svelte"],
      plugins: asPlugins({ svelte: sveltePlugin }),
      languageOptions: {
        parser: svelteParser,
        ecmaVersion: 2022,
        sourceType: "module",
        globals: COMMON_GLOBALS,
      },
      rules,
    }),
  },
};

/** Map a validated extension to its analyzer profile name. */
const EXT_TO_PROFILE: Record<string, ProfileName> = {
  ".js": "js",
  ".jsx": "js",
  ".ts": "js",
  ".tsx": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".vue": "vue",
  ".svelte": "svelte",
};

/** Resolve an extension to its profile, or null if unsupported. */
export function profileForExt(ext: string): AnalyzerProfile | null {
  const name = EXT_TO_PROFILE[ext];
  return name ? PROFILES[name] : null;
}
