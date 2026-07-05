import type { Linter } from "eslint";
import type { ProfileName } from "./analyzers.js";

/**
 * Review types → curated ESLint rule presets (§6.1).
 *
 * There is NO free-text prompt. The user picks one of these from a menu, and the
 * backend loads the matching rule set. The "intelligence" is these curated sets,
 * not a model interpreting language.
 *
 * Each preset is a plain rules object handed to Linter.verify. Adding a review
 * type is: add an entry here + write education content for any new rules.
 *
 * TWO KINDS OF PRESET:
 *  - General presets (errors, confusing, security, dead-code, runtime) use core
 *    ESLint rules and apply to ANY file family.
 *  - Framework presets (react, next, vue, svelte, node, express, nest, remix,
 *    angular, nuxt) use plugin rules and only make sense on certain file types.
 *    Each preset declares the analyzer `profiles` it supports, so the frontend
 *    can hide presets that don't fit the current file and the server can reject
 *    a mismatch (e.g. a Vue preset requested for a .ts paste).
 *
 * NON-EXECUTION (§7.2) is unchanged: every rule here is measured by parsing an
 * AST. No plugin here runs submitted code.
 */

export type ReviewType =
  | "errors"
  | "confusing"
  | "security"
  | "dead-code"
  | "runtime"
  | "react"
  | "next"
  | "vue"
  | "nuxt"
  | "angular"
  | "svelte"
  | "node"
  | "express"
  | "nest"
  | "remix";

export interface ReviewPreset {
  id: ReviewType;
  label: string; // button text shown to the user
  blurb: string; // one line describing what this review looks for
  /** Which analyzer profiles this preset's rules can run under. */
  profiles: ProfileName[];
  rules: Linter.RulesRecord;
}

// The JS/TS/JSX family — used by every general preset and most framework ones.
const JS_PROFILE: ProfileName[] = ["js"];

const PRESETS: Record<ReviewType, ReviewPreset> = {
  // ---- General presets: apply to any file family ----
  errors: {
    id: "errors",
    label: "Find errors",
    blurb: "Correctness problems that break or misbehave at runtime.",
    profiles: ["js", "vue", "svelte"],
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-cond-assign": ["warn", "always"],
      "use-isnan": "error",
      "no-constant-condition": "warn",
    },
  },

  confusing: {
    id: "confusing",
    label: "Find confusing code",
    blurb: "Code that's hard to follow — complex, deep, or ambiguous.",
    profiles: ["js", "vue", "svelte"],
    rules: {
      complexity: ["warn", 8],
      "max-depth": ["warn", 4],
      "no-shadow": "warn",
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-params": ["warn", 4],
    },
  },

  security: {
    id: "security",
    label: "Find security risks",
    blurb: "Patterns that tend to invite security problems.",
    profiles: ["js", "vue", "svelte"],
    // Approximated with core rules until eslint-plugin-security is wired in.
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
    },
  },

  "dead-code": {
    id: "dead-code",
    label: "Find dead code",
    blurb: "Things that are declared or written but never actually do anything.",
    profiles: ["js", "vue", "svelte"],
    rules: {
      "no-unused-vars": "warn",
      "no-unreachable": "warn",
      "no-empty": "warn",
      "no-useless-return": "warn",
    },
  },

  runtime: {
    id: "runtime",
    label: "Find runtime issues",
    blurb: "Subtle behaviours that surface only when the code runs.",
    profiles: ["js", "vue", "svelte"],
    rules: {
      "no-undef": "error",
      "no-use-before-define": ["warn", { functions: false }],
      "use-isnan": "error",
      "no-cond-assign": ["warn", "always"],
    },
  },

  // ---- Framework presets: JS-family (typescript-eslint parser) ----

  // React/JSX. eslint-plugin-react + eslint-plugin-react-hooks.
  react: {
    id: "react",
    label: "React",
    blurb: "Common React and Hooks mistakes in JSX/TSX components.",
    profiles: JS_PROFILE,
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-key": "error",
      "react/no-direct-mutation-state": "error",
      "react/no-children-prop": "warn",
      "react/jsx-no-duplicate-props": "error",
      "react/no-unescaped-entities": "warn",
    },
  },

  // Next.js. @next/eslint-plugin-next, layered on React conventions.
  next: {
    id: "next",
    label: "Next.js",
    blurb: "Next.js pitfalls — images, links, scripts, and head usage.",
    profiles: JS_PROFILE,
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react/jsx-key": "error",
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "off", // needs pages dir; noisy on snippets
      "@next/next/no-page-custom-font": "warn",
      "@next/next/no-sync-scripts": "warn",
      "@next/next/no-title-in-document-head": "warn",
    },
  },

  // Remix. No dedicated plugin — Remix is React + hooks + import hygiene, so we
  // curate from the React plugins rather than pretend a Remix linter exists.
  remix: {
    id: "remix",
    label: "Remix",
    blurb: "React-Router/Remix components — hooks and JSX correctness.",
    profiles: JS_PROFILE,
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-key": "error",
      "react/jsx-no-duplicate-props": "error",
      "react/no-unescaped-entities": "warn",
    },
  },

  // Plain Node.js. eslint-plugin-n.
  node: {
    id: "node",
    label: "Node.js",
    blurb: "Node runtime issues — deprecated APIs and unsupported features.",
    profiles: JS_PROFILE,
    rules: {
      "n/no-deprecated-api": "warn",
      "n/handle-callback-err": "warn",
      "n/no-path-concat": "warn",
      "n/no-process-exit": "warn",
      "no-undef": "error",
    },
  },

  // Express.js. No framework-specific linter exists; Express hygiene is Node +
  // general best-practice rules. Curated, honest about what it is.
  express: {
    id: "express",
    label: "Express.js",
    blurb: "Express/server-side hygiene — callbacks, exits, and async slips.",
    profiles: JS_PROFILE,
    rules: {
      "n/handle-callback-err": "warn",
      "n/no-process-exit": "warn",
      "no-unused-vars": "warn",
      "no-throw-literal": "warn",
      "require-atomic-updates": "warn",
    },
  },

  // NestJS. Decorator-heavy TS; typescript-eslint parses it. No official Nest
  // plugin, and type-aware rules need a tsconfig we don't provide, so this is
  // limited to syntactic checks.
  nest: {
    id: "nest",
    label: "NestJS",
    blurb: "NestJS/TypeScript service code — syntactic correctness checks.",
    profiles: JS_PROFILE,
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      "no-empty-function": "warn",
      "no-useless-constructor": "warn",
      "no-dupe-class-members": "error",
    },
  },

  // Angular. Component .ts is parseable by typescript-eslint; the rich template
  // linting (@angular-eslint/template-parser) is a separate parser we don't run
  // in v1, so this covers the class side only.
  angular: {
    id: "angular",
    label: "Angular",
    blurb: "Angular component/service classes — structural TS checks.",
    profiles: JS_PROFILE,
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      "no-empty-function": "warn",
      "no-dupe-class-members": "error",
      "@next/next/no-img-element": "off",
    },
  },

  // ---- Framework presets: dedicated parsers ----

  // Vue single-file components. eslint-plugin-vue + vue-eslint-parser.
  vue: {
    id: "vue",
    label: "Vue.js",
    blurb: "Vue SFC issues — template directives, keys, and unused parts.",
    profiles: ["vue"],
    rules: {
      "vue/require-v-for-key": "error",
      "vue/no-use-v-if-with-v-for": "warn",
      "vue/no-unused-components": "warn",
      "vue/no-mutating-props": "error",
      "vue/valid-template-root": "error",
      "vue/no-parsing-error": "error",
    },
  },

  // Nuxt.js — Vue under the hood. Same parser/plugin; the preset leans on Vue
  // rules that matter in Nuxt pages/components.
  nuxt: {
    id: "nuxt",
    label: "Nuxt.js",
    blurb: "Nuxt/Vue components — the Vue correctness checks that matter most.",
    profiles: ["vue"],
    rules: {
      "vue/require-v-for-key": "error",
      "vue/no-use-v-if-with-v-for": "warn",
      "vue/no-mutating-props": "error",
      "vue/no-parsing-error": "error",
    },
  },

  // Svelte / SvelteKit. eslint-plugin-svelte + svelte-eslint-parser.
  svelte: {
    id: "svelte",
    label: "Svelte / SvelteKit",
    blurb: "Svelte component issues — reactivity, XSS, and template mistakes.",
    profiles: ["svelte"],
    rules: {
      "svelte/no-at-html-tags": "warn",
      "svelte/no-dupe-else-if-blocks": "error",
      "svelte/no-dupe-style-properties": "warn",
      "svelte/no-unused-svelte-ignore": "warn",
      "svelte/valid-compile": "warn",
    },
  },
};

export const DEFAULT_REVIEW_TYPE: ReviewType = "errors";

/**
 * The menu the frontend renders — id, label, blurb, and supported profiles.
 * The frontend uses `profiles` to show only presets that fit the current file.
 */
export const REVIEW_MENU = Object.values(PRESETS).map(
  ({ id, label, blurb, profiles }) => ({ id, label, blurb, profiles }),
);

/** Type guard: is this string a known review type? */
export function isReviewType(value: unknown): value is ReviewType {
  return typeof value === "string" && value in PRESETS;
}

/** Resolve a review type to its rule set. Falls back to the default preset. */
export function rulesForReview(reviewType: ReviewType): Linter.RulesRecord {
  return PRESETS[reviewType].rules;
}

/** Does this review type support the given analyzer profile? */
export function reviewSupportsProfile(
  reviewType: ReviewType,
  profile: ProfileName,
): boolean {
  return PRESETS[reviewType].profiles.includes(profile);
}
