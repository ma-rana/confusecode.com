import type { EducationContent } from "./education-types.js";

/**
 * THE RULE-TO-EDUCATION MAP — the product's real value (§6.2).
 *
 * Each key is an ESLint ruleId; each value is the teaching card shown for that
 * finding. Content is written for "past-you": the stuck learner who wanted to
 * understand, not be handed a patch. Warm, explanatory — and it NEVER contains
 * a fix. Every `investigate` nudges toward research and self-solving.
 *
 * To add a rule: add an entry here. Anything not mapped falls back gracefully
 * (see fallbackEducation) so the pipeline never drops or crashes on a finding.
 */

export const RULE_EDUCATION: Record<string, EducationContent> = {
  // ---- Correctness / errors ----
  "no-undef": {
    title: "A name that was never defined",
    severity: "high",
    why: "This name isn't declared anywhere the code can see it. Usually it means a typo, a missing import, or a variable that was renamed in one place but not another. Left alone, it throws a ReferenceError the moment this line runs.",
    concept: "declarations & scope",
    difficulty: "beginner",
    investigate:
      "Search the file for where you expected this name to come from. Was it spelled differently? Imported? Declared in a scope this line can't reach? Figuring out which of those it is will point you at the fix.",
  },

  "no-unused-vars": {
    title: "Declared, but never used",
    severity: "low",
    why: "You created this, then nothing ever read it. Sometimes that's harmless leftover; often it's a clue that a line you meant to write is missing, or that you wired something up to the wrong name.",
    concept: "dead code & intent",
    difficulty: "beginner",
    investigate:
      "Ask yourself: did I mean to use this and forget, or is it genuinely leftover? If it was meant to be used, the missing usage is the real bug worth hunting.",
  },

  "no-unreachable": {
    title: "Code that can never run",
    severity: "medium",
    why: "Something above this line — a return, throw, break, or continue — hands control away before execution ever reaches here. So this code is dead weight, and worse, it hides the fact that whatever you intended it to do never happens.",
    concept: "control flow",
    difficulty: "beginner",
    investigate:
      "Read upward from this line and find the statement that exits early. Then decide: should this code run before that exit, or was the exit placed too soon?",
  },

  "no-constant-condition": {
    title: "A condition that can't change",
    severity: "medium",
    why: "This test always comes out the same way, every time — so the branch it guards is either always taken or never taken. That's rarely what someone means to write; usually a variable was meant to be in the condition and got left out.",
    concept: "boolean logic & conditions",
    difficulty: "intermediate",
    investigate:
      "Ask what this condition was supposed to depend on. If the answer is 'some value that changes at runtime', then that value is missing from the condition.",
  },

  "no-dupe-keys": {
    title: "The same key twice in one object",
    severity: "medium",
    why: "An object can only hold one value per key, so the second definition silently wins and the first is thrown away. If you expected both to matter, one of your values is quietly disappearing.",
    concept: "object literals",
    difficulty: "beginner",
    investigate:
      "Find both entries with this key and decide which value you actually want. Then work out why the other one is there — it may reveal a copy-paste slip.",
  },

  "no-dupe-args": {
    title: "Two parameters with the same name",
    severity: "medium",
    why: "When a function lists the same parameter name twice, later arguments overwrite earlier ones, so one of them becomes unreachable. It's almost always an accident that hides a bug in how the function is called.",
    concept: "function parameters & scope",
    difficulty: "beginner",
    investigate:
      "Look at what each argument position is meant to carry. One of these names should almost certainly be something else — what?",
  },

  "no-cond-assign": {
    title: "Assigning inside a condition",
    severity: "medium",
    why: "This condition uses a single `=` (assignment) where a comparison (`===`) is usually intended. Instead of asking a question, it sets a value and then tests that — a classic source of bugs that 'work' just often enough to be confusing.",
    concept: "assignment vs comparison",
    difficulty: "intermediate",
    investigate:
      "Decide whether you meant to compare or to assign here. If you meant to compare, research the difference between `=`, `==`, and `===` before changing anything.",
  },

  "use-isnan": {
    title: "Comparing directly against NaN",
    severity: "medium",
    why: "NaN is the one value in JavaScript that isn't equal to anything — not even itself. So `x === NaN` is always false, and a check written that way never fires, no matter what x is.",
    concept: "special number values",
    difficulty: "intermediate",
    investigate:
      "Look up how to correctly test whether a value is NaN. Understanding *why* the direct comparison fails is the lesson here, not just the replacement.",
  },

  // ---- Confusing code (complexity preset) ----
  complexity: {
    title: "This function has a lot going on",
    severity: "low",
    why: "The number of independent paths through this function is high enough that it's hard to hold in your head, hard to test fully, and easy to introduce bugs into. Complexity isn't wrong, but past a point it's a smell worth noticing.",
    concept: "cyclomatic complexity",
    difficulty: "intermediate",
    investigate:
      "Trace how many distinct routes execution can take through this function. Ask whether some of those branches are really a separate idea that wants to be its own function.",
  },

  "max-depth": {
    title: "Deeply nested blocks",
    severity: "low",
    why: "Each level of nesting — an if inside a loop inside an if — is another thing the reader must keep track of at once. Deep nesting is one of the most reliable signals that logic has become hard to follow.",
    concept: "nesting & readability",
    difficulty: "intermediate",
    investigate:
      "Look at the innermost block. Research techniques like early returns or guard clauses and consider how they change the shape of this code.",
  },

  "no-shadow": {
    title: "A name that hides another name",
    severity: "medium",
    why: "This variable shares its name with one from an outer scope, so inside here the outer one is invisible. Readers (and future-you) can't easily tell which is meant, and it's a common source of 'why is this value wrong?' confusion.",
    concept: "variable scope & shadowing",
    difficulty: "beginner",
    investigate:
      "Find the outer variable with the same name. Decide whether you actually meant to reuse that name here, or whether one of the two should be called something clearer.",
  },

  "max-lines-per-function": {
    title: "A very long function",
    severity: "low",
    why: "Length itself isn't a bug, but a function this long usually does several jobs at once, which makes it harder to name, test, and reuse. It's a nudge to ask whether one responsibility has quietly become many.",
    concept: "single responsibility",
    difficulty: "intermediate",
    investigate:
      "Skim the function and see if you can name two or three distinct things it does. If you can, that's a hint about where its seams are.",
  },

  "max-params": {
    title: "A lot of parameters",
    severity: "low",
    why: "When a function takes many parameters, calls become hard to read (which argument is which?) and easy to get wrong by order. It often signals that some of those values belong together as one object.",
    concept: "function interfaces",
    difficulty: "intermediate",
    investigate:
      "Look at the parameter list and ask whether some of them naturally group together. Research the 'parameter object' pattern and weigh whether it fits here.",
  },

  // ---- Runtime issues ----
  "no-use-before-define": {
    title: "Used before it's defined",
    severity: "medium",
    why: "This name is referenced earlier in the code than where it's declared. Depending on how it was declared, that can mean it's undefined at the moment you use it — a bug that hides behind JavaScript's hoisting rules.",
    concept: "hoisting & temporal dead zone",
    difficulty: "advanced",
    investigate:
      "Research how `var`, `let`, `const`, and function declarations differ in when they become usable. That difference is exactly what this finding is about.",
  },

  // ---- React / JSX (framework preset) ----
  "react-hooks/rules-of-hooks": {
    title: "A Hook called in the wrong place",
    severity: "high",
    why: "React Hooks have to be called in the same order on every render, so they can only live at the top level of a component or another Hook — never inside a condition, loop, or nested function. Break that and React loses track of which state belongs to which Hook, which corrupts state in ways that are maddening to debug.",
    concept: "Rules of Hooks & render order",
    difficulty: "intermediate",
    investigate:
      "Find which Hook this is and what it's nested inside — an if, a loop, a callback? Research why React depends on Hooks running in a stable order, and that will tell you where this call actually belongs.",
  },

  "react-hooks/exhaustive-deps": {
    title: "A dependency array that doesn't match",
    severity: "medium",
    why: "This effect (or memo/callback) reads a value that isn't in its dependency array, so React won't re-run it when that value changes. The effect then runs with a stale copy — the classic 'why is it showing the old value?' bug.",
    concept: "effect dependencies & closures",
    difficulty: "advanced",
    investigate:
      "List every value from component scope that the effect body uses, then compare that to what's in the array. Research how a closure captures values at render time to understand why the missing one goes stale.",
  },

  "react/jsx-key": {
    title: "A list without keys",
    severity: "medium",
    why: "When you render a list, React uses a `key` on each item to tell which one changed, moved, or was removed. Without stable keys it falls back to position, which can reuse the wrong element and scramble state or inputs across rows.",
    concept: "list reconciliation & keys",
    difficulty: "beginner",
    investigate:
      "Find the array you're mapping over and ask what makes each item uniquely itself. Research why the array index is usually a poor key before reaching for it.",
  },

  "react/no-direct-mutation-state": {
    title: "Changing state directly",
    severity: "high",
    why: "Assigning to state in place doesn't tell React anything changed, so it won't re-render — and the value you mutated may be read inconsistently. React relies on you replacing state through its setter, not editing it underneath.",
    concept: "immutability & state updates",
    difficulty: "intermediate",
    investigate:
      "Look at how this state was created and how React expects it to be updated. Research why React treats state as immutable and what the setter gives you that direct assignment doesn't.",
  },

  "react/no-children-prop": {
    title: "Passing children as a prop",
    severity: "low",
    why: "Passing `children` as an explicit prop works but sidesteps the normal JSX nesting that React and other readers expect. It's usually a sign of a misunderstanding about how content gets into a component.",
    concept: "children & composition",
    difficulty: "beginner",
    investigate:
      "Research how JSX passes nested content to a component as children, then compare that to what you've written here and decide which reads more clearly.",
  },

  "react/jsx-no-duplicate-props": {
    title: "The same prop set twice",
    severity: "medium",
    why: "When a JSX element lists the same prop twice, the last one silently wins and the first is discarded. If you expected both to take effect, one of your values is quietly vanishing.",
    concept: "JSX props",
    difficulty: "beginner",
    investigate:
      "Find both copies of the prop and decide which value you actually want. Then work out how the duplicate got there — often a copy-paste or a merge slip.",
  },

  "react/no-unescaped-entities": {
    title: "Raw characters in JSX text",
    severity: "low",
    why: "Certain characters like quotes and angle brackets have special meaning in JSX, so left raw they can render oddly or be read as markup. It rarely breaks loudly, which is exactly why it slips through.",
    concept: "JSX text & escaping",
    difficulty: "beginner",
    investigate:
      "Identify which character on this line is the culprit, then research how JSX wants that character written in visible text.",
  },
};

/**
 * Fallback for any ruleId not in the map (e.g. plugin rules whose lessons
 * aren't written yet). Keeps the UI consistent and honest instead of dropping
 * the finding or crashing.
 */
export function fallbackEducation(
  ruleId: string | null,
  eslintMessage: string,
): EducationContent {
  return {
    title: ruleId ? `Flagged: ${ruleId}` : "Something was flagged",
    severity: "info",
    // The ESLint message is the only description we have. It echoes user
    // identifiers, so it's treated as untrusted and escaped when rendered.
    why: eslintMessage,
    concept: "general code quality",
    difficulty: "intermediate",
    investigate:
      "This check doesn't have a written lesson yet. Look up the rule name to learn what it measures and why it might matter here.",
  };
}
