/**
 * Regenerate server/utils/lactateThresholdEngine.js from the client's copy.
 *
 * The engine is written once, as an ES module in client/src/utils, because
 * the calculator, the zones and the app run it there. The server needs the
 * same numbers for report e-mails and zones, and cannot import the client,
 * so this rewrites the ES exports as CommonJS. utils/lactateThresholdEngine.test.js
 * fails when the two drift — run this after editing the client file.
 *
 *   node server/scripts/syncLactateEngine.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'lactateThresholdEngine.js');
const DEST = path.join(__dirname, '..', 'utils', 'lactateThresholdEngine.js');

function toCommonJs(src) {
  const names = [];
  let out = src.replace(/^export (const|function) ([A-Za-z0-9_]+)/gm, (m, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  out = `/* GENERATED from client/src/utils/lactateThresholdEngine.js by scripts/syncLactateEngine.js — do not edit here. */\n'use strict';\n\n${out.trimEnd()}\n\nmodule.exports = { ${names.join(', ')} };\n`;
  return out;
}

if (require.main === module) {
  const src = fs.readFileSync(SRC, 'utf8');
  fs.writeFileSync(DEST, toCommonJs(src));
  console.log(`wrote ${path.relative(process.cwd(), DEST)}`);
}

module.exports = { toCommonJs, SRC, DEST };
