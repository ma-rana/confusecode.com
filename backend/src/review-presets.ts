import type { Linter } from "eslint";

/**
 * Review types and framework rule sets — the curated ESLint intelligence (§6.1).
 *
 * There is NO free-text prompt. The user picks a review TYPE (what kind of
 * problem to look for) from a menu, and separately a FRAMEWORK (which drives the
 * parser). The backend merges the two rule sets. The "intelligence" is these
 * curated sets, not a model interpreting language.
 *
 * TWO SEPARATE CONCERNS, deliberately split:
 *  - REVIEW TYPES (errors, confusing, security, dead-code, runtime): the buttons
 *    the user sees under "What kind of review?". Core ESLint rules, apply to any
 *    file family. These are the menu.
 *  - FRAMEWORK RULES (react, next, vue, svelte, …): plugin rules tied to the
 *    framework the user selected in the picker. NOT shown as review buttons —
 *    they run automatically for the chosen framework, merged into whatever
 *    review type is active. So "Vue + Find errors" runs Vue's rules AND the
 *    error rules together.
 *
 * NON-EXECUTION (§7.2) is unchanged: every rule here is measured by parsing an
 * AST. No plugin here runs submitted code.
 */

// ---- Review types: the "What kind of review?" menu ----

export type ReviewType =
  | "errors"
  | "confusing"
  | "security"
  | "dead-code"
  | "runtime";

export interface ReviewPreset {
  id: ReviewType;
  label: string; // button text shown to the user
  blurb: string; // one line describing what this review looks for
  rules: Linter.RulesRecord;
}

const REVIEW_PRESETS: Record<ReviewType, ReviewPreset> = {
  errors: {
    id: "errors",
    label: "Find errors",
    blurb: "Correctness problems that break or misbehave at runtime.",
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
    rules: {
      "no-undef": "error",
      "no-use-before-define": ["warn", { functions: false }],
      "use-isnan": "error",
      "no-cond-assign": ["warn", "always"],
    },
  },
};

export const DEFAULT_REVIEW_TYPE: ReviewType = "errors";

// ---- Framework rule sets: chosen by the framework picker, not the menu ----

export type Framework =
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

/**
 * Rules that run automatically for the selected framework, on top of the chosen
 * review type. Keyed by framework. Vue/Nuxt rules only fire on the vue parser
 * profile and Svelte only on the svelte profile — the worker won't have those
 * plugins active otherwise — but that's fine: the framework the user picks
 * determines the parser too, so they always line up.
 */
const FRAMEWORK_RULES: Record<Framework, Linter.RulesRecord> = {
  // React/JSX. eslint-plugin-react + eslint-plugin-react-hooks.
  react: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "react/jsx-key": "error",
    "react/no-direct-mutation-state": "error",
    "react/no-children-prop": "warn",
    "react/jsx-no-duplicate-props": "error",
    "react/no-unescaped-entities": "warn",
  },

  // Next.js. @next/eslint-plugin-next, layered on React conventions.
  next: {
    "react-hooks/rules-of-hooks": "error",
    "react/jsx-key": "error",
    "@next/next/no-img-element": "warn",
    "@next/next/no-html-link-for-pages": "off", // needs pages dir; noisy on snippets
    "@next/next/no-page-custom-font": "warn",
    "@next/next/no-sync-scripts": "warn",
    "@next/next/no-title-in-document-head": "warn",
  },

  // Remix. No dedicated plugin — Remix is React + hooks + import hygiene, so we
  // curate from the React plugins rather than pretend a Remix linter exists.
  remix: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "react/jsx-key": "error",
    "react/jsx-no-duplicate-props": "error",
    "react/no-unescaped-entities": "warn",
  },

  // Plain Node.js. eslint-plugin-n.
  node: {
    "n/no-deprecated-api": "warn",
    "n/handle-callback-err": "warn",
    "n/no-path-concat": "warn",
    "n/no-process-exit": "warn",
  },

  // Express.js. No framework-specific linter exists; Express hygiene is Node +
  // general best-practice rules. Curated, honest about what it is.
  express: {
    "n/handle-callback-err": "warn",
    "n/no-process-exit": "warn",
    "no-throw-literal": "warn",
    "require-atomic-updates": "warn",
  },

  // NestJS. Decorator-heavy TS; typescript-eslint parses it. No official Nest
  // plugin, and type-aware rules need a tsconfig we don't provide, so this is
  // limited to syntactic checks.
  nest: {
    "no-empty-function": "warn",
    "no-useless-constructor": "warn",
    "no-dupe-class-members": "error",
  },

  // Angular. Component .ts is parseable by typescript-eslint; the rich template
  // linting (@angular-eslint/template-parser) is a separate parser we don't run
  // in v1, so this covers the class side only.
  angular: {
    "no-empty-function": "warn",
    "no-dupe-class-members": "error",
  },

  // Vue single-file components. eslint-plugin-vue + vue-eslint-parser.
  vue: {
    "vue/require-v-for-key": "error",
    "vue/no-use-v-if-with-v-for": "warn",
    "vue/no-unused-components": "warn",
    "vue/no-mutating-props": "error",
    "vue/valid-template-root": "error",
    "vue/no-parsing-error": "error",
  },

  // Nuxt.js — Vue under the hood. Same parser/plugin; leans on the Vue rules
  // that matter in Nuxt pages/components.
  nuxt: {
    "vue/require-v-for-key": "error",
    "vue/no-use-v-if-with-v-for": "warn",
    "vue/no-mutating-props": "error",
    "vue/no-parsing-error": "error",
  },

  // Svelte / SvelteKit. eslint-plugin-svelte + svelte-eslint-parser.
  svelte: {
    "svelte/no-at-html-tags": "warn",
    "svelte/no-dupe-else-if-blocks": "error",
    "svelte/no-dupe-style-properties": "warn",
    "svelte/no-unused-svelte-ignore": "warn",
    "svelte/valid-compile": "warn",
  },
};

// ---- Menu + lookups ----

/**
 * The menu the frontend renders as review buttons — id, label, blurb. These are
 * the five general review types; frameworks are NOT here (they're the picker).
 */
export const REVIEW_MENU = Object.values(REVIEW_PRESETS).map(
  ({ id, label, blurb }) => ({ id, label, blurb }),
);

/** Type guard: is this string a known review type? */
export function isReviewType(value: unknown): value is ReviewType {
  return typeof value === "string" && value in REVIEW_PRESETS;
}

/** Type guard: is this string a known framework? */
export function isFramework(value: unknown): value is Framework {
  return typeof value === "string" && value in FRAMEWORK_RULES;
}

/**
 * Build the rule set for an analysis: the chosen review type's rules PLUS the
 * selected framework's rules. Framework rules come second so a framework can
 * tune a shared rule if needed. If no framework is given, just the review rules.
 */
export function rulesFor(
  reviewType: ReviewType,
  framework: Framework | null,
): Linter.RulesRecord {
  const reviewRules = REVIEW_PRESETS[reviewType].rules;
  if (!framework) return reviewRules;
  return { ...reviewRules, ...FRAMEWORK_RULES[framework] };
}
