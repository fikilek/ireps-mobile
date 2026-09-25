#!/usr/bin/env node

/**
 * UI-R004 — on a form, every word a worker reads is black.
 *
 * This check fails the build when a form writes a grey text colour of its own
 * instead of taking it from src/theme/formColors.js. Grey text is unreadable
 * on a phone outdoors, which is why the rule exists.
 *
 * What it covers is what the rule covers: a form and the words on it. A
 * dashboard or a list that happens to hold a search box is checked for the box
 * itself, its field name and its hint, and nothing else.
 */

const fs = require("fs");
const { execSync } = require("child_process");

// The slate and neutral greys the app used for form words before UI-R004.
const GREY =
  /^(#(64748b|94a3b8|9ca3af|6b7280|475569|334155|1e293b|111827|1f2937|4b5563|71717a|8e8e93|757575|888888|999999|666666|333333|888|999|666|333)|grey|gray|darkgrey|darkgray|lightgrey|lightgray|dimgrey|dimgray|silver)$/i;

// The forms themselves: every word on them is black.
const FORMS = [
  /^app\/\(auth\)\//,
  /^app\/onboarding\//,
  /^app\/\(tabs\)\/asts\//,
  /^app\/\(tabs\)\/admin\/users\//,
  /^components\/forms\//,
  /^components\/IrepsSelectWithOther\.jsx$/,
  /^components\/DateWindowPicker\.js$/,
  /^src\/features\/erfs\/FormInformalErf\.js$/,
  /^src\/features\/premises\//,
  /^src\/features\/serviceProviders\//,
];

// Elsewhere, only the box and the words attached to it.
const BOX = /input|label|hint|placeholder|field|search|value|caption|helper/i;

// Buttons and disabled states keep their own colours: they are signals, not
// words to read (UI-R004 section 2).
const SIGNAL = /button|disabled|error|pill|badge|chip/i;

function fail(message) {
  console.error(`\n[iREPS CI] ${message}`);
  process.exit(1);
}

const files = execSync("git ls-files app components src", { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(js|jsx)$/.test(f));

const offenders = [];
let checked = 0;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  // A form is a file with a box in it, a dropdown, or one that fills a
  // shared box. FormSelect.js taught this the hard way: it holds the field
  // name above every dropdown in the app and the checker walked past it
  // because it contains no TextInput.
  const isForm =
    source.includes("TextInput") ||
    source.includes("placeholder=") ||
    source.includes("List.Item") ||
    source.includes("onValueChange") ||
    file.startsWith("components/forms/");
  if (!isForm) continue;
  checked += 1;

  const everyWordBlack = FORMS.some((pattern) => pattern.test(file));
  let styleKey = "";

  source.split(/\r?\n/).forEach((line, index) => {
    const keyMatch = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*\{\s*$/);
    if (keyMatch) styleKey = keyMatch[1];

    const colour = line.match(/\bcolor:\s*["'](#[0-9a-fA-F]{3,6})["']/);
    const isSignal = SIGNAL.test(styleKey);
    if (
      colour &&
      GREY.test(colour[1]) &&
      !isSignal &&
      (everyWordBlack || BOX.test(styleKey))
    ) {
      offenders.push(`${file}:${index + 1}  ${colour[1]}`);
    }

    // A hard-coded hint colour is always wrong: a hint only ever appears
    // inside an input box.
    const hint = line.match(
      /placeholderTextColor\s*=\s*\{?\s*["'](#[0-9a-fA-F]{3,6})["']/,
    );
    if (hint) offenders.push(`${file}:${index + 1}  hint ${hint[1]}`);
  });
}

if (offenders.length) {
  fail(
    `UI-R004: ${offenders.length} grey word(s) on a form. Take the colour from src/theme/formColors.js instead:\n  ` +
      offenders.join("\n  "),
  );
}

console.log(
  `[iREPS CI] UI-R004: every form word takes its colour from src/theme/formColors.js (${checked} forms checked).`,
);
