#!/usr/bin/env node
/**
 * Generate the server's CommonJS copies of client util modules that both sides
 * have to agree on, digit for digit.
 *
 * The repo already carries hand-written twins (lactateThresholds,
 * trainingZoneBounds) and each one comes with a "keep the two in step" comment,
 * which is a comment because nothing enforces it. For the threshold-drift
 * engine that gap is not survivable: the panel under a session computes in the
 * browser, the drift history computes on the server, and an athlete who reads
 * +14 W on one screen and +11 W on the other has no reason to believe either.
 *
 * So these copies are generated. Nothing is retyped, the transform is only ever
 * syntax, and --check fails the moment the two fall apart.
 *
 *   node scripts/sync-shared-utils.js          # rewrite the server copies
 *   node scripts/sync-shared-utils.js --check  # fail if any is out of date
 *
 * Only modules with no imports can be listed here — the transform rewrites
 * `export` and nothing else.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** [client ESM source, server CommonJS destination] */
const PAIRS = [
  ['client/src/utils/hrPowerProfile.js', 'server/utils/hrPowerProfile.js'],
  ['client/src/utils/lactateTestInputMode.js', 'server/utils/lactateTestInputMode.js'],
];

function banner(from) {
  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * CommonJS twin of ${from}, produced by
 * scripts/sync-shared-utils.js. Edit the client module and re-run:
 *
 *   node scripts/sync-shared-utils.js
 *
 * Both sides of the app compute these numbers — the browser for the session in
 * front of you, the server for the history behind it — and they must agree.
 */

'use strict';

`;
}

function generate(source, from) {
  const exported = [];
  const body = source.replace(/^export function (\w+)/gm, (_, name) => {
    exported.push(name);
    return `function ${name}`;
  });
  if (/^export /m.test(body)) {
    throw new Error(`${from}: unsupported export form — only \`export function\` is handled`);
  }
  if (/^import /m.test(body)) {
    throw new Error(`${from}: has imports, which the transform cannot follow`);
  }
  exported.sort();
  return `${banner(from)}${body}\nmodule.exports = {\n${exported.map((n) => `  ${n},`).join('\n')}\n};\n`;
}

const check = process.argv.includes('--check');
let stale = 0;

for (const [from, to] of PAIRS) {
  const generated = generate(fs.readFileSync(path.join(ROOT, from), 'utf8'), from);
  const dest = path.join(ROOT, to);
  if (check) {
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
    if (current !== generated) {
      console.error(`OUT OF DATE  ${to}`);
      stale += 1;
    } else {
      console.log(`in step      ${to}`);
    }
  } else {
    fs.writeFileSync(dest, generated);
    console.log(`wrote        ${to}`);
  }
}

if (check && stale) {
  console.error(`\n${stale} file(s) out of date — run: node scripts/sync-shared-utils.js`);
  process.exit(1);
}
