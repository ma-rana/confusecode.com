/**
 * TEMPORARY diagnostic — measures how long the parser stack takes to load and
 * how long a single analysis takes ON THIS MACHINE. Run with:
 *
 *   npx tsx src/probe-timing.ts
 *
 * Delete this file once the timeout issue is sorted.
 */
const t0 = performance.now();

const { profileForExt } = await import("./analyzers.ts");
const tLoaded = performance.now();
console.log(`parser stack loaded in ${(tLoaded - t0).toFixed(0)}ms`);

const { Linter } = await import("eslint");
const linter = new Linter();

const profile = profileForExt(".tsx");
if (!profile) throw new Error("no profile");

const tBeforeVerify = performance.now();
const messages = linter.verify(
  `function L({ items }) { return items.map((i) => <li>{i}</li>); }`,
  profile.build({ "react/jsx-key": "error" }),
  profile.filenameFor(".tsx"),
);
const tAfter = performance.now();

console.log(`first verify (.tsx) in ${(tAfter - tBeforeVerify).toFixed(0)}ms, ${messages.length} findings`);

// A second verify to show the warm cost.
const t2 = performance.now();
linter.verify(
  `function L({ items }) { return items.map((i) => <li>{i}</li>); }`,
  profile.build({ "react/jsx-key": "error" }),
  profile.filenameFor(".tsx"),
);
console.log(`second verify (warm) in ${(performance.now() - t2).toFixed(0)}ms`);

// Vue load cost (its parser + the svelte peer are the heavy ones).
const vueProfile = profileForExt(".vue");
if (vueProfile) {
  const tv = performance.now();
  linter.verify(
    `<template><div v-for="i in x">{{ i }}</div></template>\n<script>export default { data() { return { x: [] }; } }</script>`,
    vueProfile.build({ "vue/require-v-for-key": "error" }),
    vueProfile.filenameFor(".vue"),
  );
  console.log(`vue verify in ${(performance.now() - tv).toFixed(0)}ms`);
}

console.log(`\nTOTAL wall time: ${(performance.now() - t0).toFixed(0)}ms`);
console.log("If 'parser stack loaded' is over ~3000ms, the cold load is the problem.");
