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
 * The transform only rewrites module syntax: `export function` becomes a plain
 * declaration, and a relative import of another module in this list becomes a
 * `require` of its generated twin. Nothing else is touched, so the two copies
 * cannot drift in anything that matters.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** [client ESM source, server CommonJS destination] */
const PAIRS = [
  ['client/src/utils/hrPowerProfile.js', 'server/utils/hrPowerProfile.js'],
  ['client/src/utils/lactateTestInputMode.js', 'server/utils/lactateTestInputMode.js'],
  // Thresholds for an athlete who has never tested. Shared because the email
  // that quotes an estimated LT2 and the card that draws it have to agree on
  // the number, and the two are computed on different sides of the wire.
  ['client/src/utils/estimateAnchorFromTraining.js', 'server/utils/estimateAnchorFromTraining.js'],
];

/** Which generated twin a client module's relative import resolves to. */
const TWIN_BY_SOURCE = new Map(PAIRS.map(([from, to]) => [
  path.basename(from, '.js'),
  `./${path.basename(to)}`,
]));

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
  let body = source.replace(/^export function (\w+)/gm, (_, name) => {
    exported.push(name);
    return `function ${name}`;
  });
  if (/^export /m.test(body)) {
    throw new Error(`${from}: unsupported export form — only \`export function\` is handled`);
  }

  // A relative import is only followable when the thing it imports is itself
  // generated; anything else would leave the server copy referring to a file
  // that does not exist there.
  body = body.replace(
    /^import\s+(\{[^}]*\})\s+from\s+'\.\/([\w.-]+)';$/gm,
    (line, names, mod) => {
      const twin = TWIN_BY_SOURCE.get(mod.replace(/\.js$/, ''));
      if (!twin) {
        throw new Error(`${from}: imports './${mod}', which is not itself synced — add it to PAIRS`);
      }
      return `const ${names} = require('${twin}');`;
    },
  );
  if (/^import /m.test(body)) {
    throw new Error(`${from}: has an import the transform cannot follow`);
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
