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

  "valid-typeof": {
    title: "A typeof compared to something impossible",
    severity: "high",
    why: "`typeof` only ever returns one of a small set of strings (\"string\", \"number\", \"undefined\", and so on). Comparing it to anything else — usually a typo like \"undefiend\" or \"boolena\" — means the check can never be true, so the branch it guards silently never runs.",
    concept: "the typeof operator",
    difficulty: "beginner",
    investigate:
      "Read the string you're comparing against carefully, then look up the exact set of values typeof can return. One of them is what you meant.",
  },

  "no-unsafe-negation": {
    title: "A negation that binds the wrong way",
    severity: "high",
    why: "Something like `!a in b` or `!a instanceof B` reads as 'negate a, then test' — but that's almost never intended, and the result is a boolean tested against the operator, which is nonsense. The `!` is grabbing the wrong thing.",
    concept: "operator precedence",
    difficulty: "intermediate",
    investigate:
      "Work out what this line does step by step given how `!` binds, then compare that to what you meant. Research where parentheses would change the grouping.",
  },

  "no-self-compare": {
    title: "A value compared to itself",
    severity: "medium",
    why: "Comparing something to itself is always true (or, for NaN, always false) — so the test tells you nothing. Usually one side was meant to be a different variable, and that mix-up is the real bug.",
    concept: "comparisons",
    difficulty: "beginner",
    investigate:
      "Look at both sides of the comparison. One of them is probably meant to be something else — what were you actually trying to check?",
  },

  "no-fallthrough": {
    title: "A switch case that falls through",
    severity: "medium",
    why: "A case without a break (or return/throw) keeps running into the next case's code. Sometimes that's intended, but far more often it's a forgotten break, so two cases' logic run when only one should.",
    concept: "switch statements",
    difficulty: "beginner",
    investigate:
      "Decide whether this case was meant to continue into the next one. If not, research how to stop a case from falling through — and if it *was* intended, how to say so clearly.",
  },

  "no-dupe-else-if": {
    title: "The same condition twice in an if-chain",
    severity: "medium",
    why: "An else-if branch repeats a condition already tested earlier in the chain, so it can never be reached — the first match always wins. One of the two was probably meant to test something different.",
    concept: "conditional chains",
    difficulty: "beginner",
    investigate:
      "Find the earlier branch with the same condition. Then ask what this later branch was *supposed* to check — that's the line with the real mistake.",
  },

  // ---- Risky habits ----
  eqeqeq: {
    title: "Loose equality (== instead of ===)",
    severity: "medium",
    why: "`==` converts types before comparing, so `0 == ''`, `null == undefined`, and `1 == true` are all true. Those surprises cause bugs that are hard to spot. `===` compares without the hidden conversion, so what you see is what you get.",
    concept: "equality & type coercion",
    difficulty: "beginner",
    investigate:
      "Research the difference between `==` and `===`, and look up a few of the surprising `==` results. Then decide whether this comparison really wants the loose behaviour.",
  },

  "no-var": {
    title: "Using var instead of let/const",
    severity: "low",
    why: "`var` is function-scoped and hoisted, which leads to variables leaking out of blocks and being usable before their declaration — a steady source of subtle bugs. `let` and `const` are block-scoped and behave the way most people expect.",
    concept: "variable declarations & scope",
    difficulty: "beginner",
    investigate:
      "Research how `var` scoping differs from `let` and `const`. Understanding *why* block scope is safer is the point, not just swapping the keyword.",
  },

  "no-implicit-coercion": {
    title: "A shortcut that hides a type conversion",
    severity: "low",
    why: "Tricks like `!!x`, `+x`, or `'' + x` quietly convert types using side effects of operators. They're compact but obscure — a reader has to know the trick to see that a boolean/number/string conversion is happening at all.",
    concept: "type conversion & clarity",
    difficulty: "intermediate",
    investigate:
      "Work out which type this expression is converting to, then research the explicit function that does the same thing. Ask which one a newcomer would understand faster.",
  },

  "no-param-reassign": {
    title: "Reassigning a function parameter",
    severity: "medium",
    why: "Changing a parameter inside a function makes it lie about what was passed in, and if the argument is an object, mutating it can change the caller's data unexpectedly. Both make the function harder to reason about from the outside.",
    concept: "parameters & side effects",
    difficulty: "intermediate",
    investigate:
      "Decide whether you meant to change the caller's value or just needed a local working copy. Research why a fresh local variable is usually the safer choice.",
  },

  "no-nested-ternary": {
    title: "Ternaries inside ternaries",
    severity: "low",
    why: "A ternary nested inside another packs several decisions onto one line with no names for the branches. It's dense to read and easy to misjudge which condition leads where — a classic 'looks clever, reads awful' pattern.",
    concept: "readable conditionals",
    difficulty: "beginner",
    investigate:
      "Try tracing each possible outcome and the path to it. If that takes real effort, research how the same logic reads as if/else or separate statements.",
  },

  "no-else-return": {
    title: "An else after a return",
    severity: "low",
    why: "If the if-branch already returns, the code after it runs only when the condition was false — so the `else` wrapper adds a level of nesting without adding meaning. Dropping it flattens the function and reads more directly.",
    concept: "guard clauses & early return",
    difficulty: "beginner",
    investigate:
      "Look at what happens after the if. Research the 'early return' / 'guard clause' style and picture this function with the else removed.",
  },

  "no-lonely-if": {
    title: "A lone if inside an else",
    severity: "low",
    why: "An `else` block that contains only an `if` is really an `else if` in disguise, with an extra layer of braces. Collapsing it makes the chain of conditions read as one sequence instead of a staircase.",
    concept: "conditional structure",
    difficulty: "beginner",
    investigate:
      "Look at the else block wrapping this if. Research how `else if` chains read, and picture this rewritten as one.",
  },

  "no-eval": {
    title: "Using eval()",
    severity: "high",
    why: "`eval` runs a string as live code. If any part of that string ever comes from user input, it's a direct path to running attacker code; even when it doesn't, it defeats tooling, is slow, and hides what actually executes. It's almost never the right tool.",
    concept: "dynamic code execution & injection",
    difficulty: "intermediate",
    investigate:
      "Work out what you're trying to achieve with eval here, then research the safe, direct way to do that same thing (often an object lookup, JSON.parse, or a function).",
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

  // ---- Next.js ----
  "@next/next/no-img-element": {
    title: "A plain <img> in a Next app",
    severity: "low",
    why: "Next ships an Image component that handles lazy-loading, sizing, and format optimization for you. A raw <img> skips all of that, which tends to hurt load performance — often the thing Next was chosen to improve.",
    concept: "framework-provided components",
    difficulty: "beginner",
    investigate:
      "Research what Next's Image component does that a bare <img> doesn't, then weigh whether this image should use it.",
  },

  "@next/next/no-sync-scripts": {
    title: "A synchronous script tag",
    severity: "medium",
    why: "A script without async or defer blocks the browser from rendering until it finishes downloading and running. In a framework built around fast first paint, that's a self-inflicted stall.",
    concept: "script loading & blocking",
    difficulty: "intermediate",
    investigate:
      "Look up the difference between a normal, an async, and a deferred script, and decide which one this actually needs to be.",
  },

  // ---- Node.js ----
  "n/no-deprecated-api": {
    title: "A deprecated Node API",
    severity: "medium",
    why: "This built-in was deprecated — it still runs today but is scheduled to change or vanish, and some deprecated APIs (like the old Buffer constructor) also carry real security footguns. Code resting on it is quietly on borrowed time.",
    concept: "API lifecycles & deprecation",
    difficulty: "intermediate",
    investigate:
      "Find the current, recommended replacement for this API and read why it was deprecated — the reason usually explains the risk.",
  },

  "n/handle-callback-err": {
    title: "An ignored error argument",
    severity: "high",
    why: "Node's callback convention puts an error in the first argument, and this code never checks it. When that error fires it's silently swallowed, so failures pass unnoticed until something downstream breaks in a confusing way.",
    concept: "error-first callbacks",
    difficulty: "intermediate",
    investigate:
      "Find the callback's error parameter and trace what should happen when it's set. Research the 'error-first callback' convention if it's unfamiliar.",
  },

  "n/no-process-exit": {
    title: "A hard process.exit()",
    severity: "medium",
    why: "Calling process.exit() kills the process immediately, cutting off pending I/O, logs, and cleanup mid-flight. In a server that usually means half-finished work and lost output rather than a graceful shutdown.",
    concept: "process lifecycle & shutdown",
    difficulty: "intermediate",
    investigate:
      "Research how to signal failure without an abrupt exit (exit codes, letting errors propagate) and consider what pending work this cut short.",
  },

  // ---- Vue ----
  "vue/require-v-for-key": {
    title: "A v-for without a key",
    severity: "medium",
    why: "Vue uses a key on each v-for item to track which one changed or moved. Without it, Vue falls back to reusing elements by position, which can carry over the wrong state — a stray input value or checkbox landing on the wrong row.",
    concept: "list rendering & keys",
    difficulty: "beginner",
    investigate:
      "Find what uniquely identifies each item in this list, then research why Vue wants that as the key rather than the index.",
  },

  "vue/no-mutating-props": {
    title: "Mutating a prop directly",
    severity: "high",
    why: "Props flow down from parent to child; changing one inside the child breaks that one-way flow. The parent doesn't know, the value can be overwritten on the next render, and the bug is hard to trace because the two sides disagree about the truth.",
    concept: "one-way data flow",
    difficulty: "intermediate",
    investigate:
      "Research how Vue expects a child to request a change to a parent's value (events, or local copies) instead of editing the prop in place.",
  },

  "vue/no-use-v-if-with-v-for": {
    title: "v-if and v-for on one element",
    severity: "medium",
    why: "When both sit on the same element, Vue's precedence between them isn't what most people expect, so the filtering often runs in a surprising order or over the wrong set. It's a readability and correctness trap at once.",
    concept: "directive precedence",
    difficulty: "intermediate",
    investigate:
      "Look up how Vue prioritises v-if versus v-for on the same node, then consider moving one of them to a wrapper or a computed list.",
  },

  // ---- Svelte ----
  "svelte/no-at-html-tags": {
    title: "Raw HTML injection with {@html}",
    severity: "high",
    why: "{@html} drops a string into the page as real markup, bypassing Svelte's escaping. If any part of that string comes from user input, it's a direct cross-site-scripting hole — one of the oldest and most damaging web vulnerabilities.",
    concept: "XSS & output escaping",
    difficulty: "advanced",
    investigate:
      "Trace where this HTML string comes from. Research what XSS is and why rendering untrusted HTML is dangerous before deciding how to handle it.",
  },

  "svelte/no-dupe-style-properties": {
    title: "The same style property twice",
    severity: "low",
    why: "When a style lists the same property twice, the last one wins and the earlier is discarded. If you expected the first to apply, it's silently doing nothing.",
    concept: "CSS declarations",
    difficulty: "beginner",
    investigate:
      "Find both declarations of the property and decide which you meant to keep, then work out how the duplicate crept in.",
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
