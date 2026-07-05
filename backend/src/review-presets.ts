import type { Linter } from "eslint";

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
 * NOTE: presets here use only core ESLint rules, which need no plugin install
 * and run purely by parsing (no code execution). eslint-plugin-security and a
 * dead-code pass (knip / ts-prune) are the natural next additions for the
 * security and dead-code presets; they're scoped but not wired yet, so those
 * presets currently lean on the core rules that approximate their intent.
 */

export type ReviewType =
  | "errors"
  | "confusing"
  | "security"
  | "dead-code"
  | "runtime"
  | "react";

export interface ReviewPreset {
  id: ReviewType;
  label: string; // button text shown to the user
  blurb: string; // one line describing what this review looks for
  rules: Linter.RulesRecord;
}

const PRESETS: Record<ReviewType, ReviewPreset> = {
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

  // Framework preset: React/JSX. Uses eslint-plugin-react +
  // eslint-plugin-react-hooks, registered in the worker. These rules parse only
  // (no execution), same as core rules — the plugin just knows JSX and hooks.
  react: {
    id: "react",
    label: "Find React issues",
    blurb: "Common React and Hooks mistakes in JSX/TSX components.",
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
};

export const DEFAULT_REVIEW_TYPE: ReviewType = "errors";

/** The menu the frontend renders — id, label, and blurb only (no rules). */
export const REVIEW_MENU = Object.values(PRESETS).map(({ id, label, blurb }) => ({
  id,
  label,
  blurb,
}));

/** Type guard: is this string a known review type? */
export function isReviewType(value: unknown): value is ReviewType {
  return typeof value === "string" && value in PRESETS;
}

/** Resolve a review type to its rule set. Falls back to the default preset. */
export function rulesForReview(reviewType: ReviewType): Linter.RulesRecord {
  return PRESETS[reviewType].rules;
}
