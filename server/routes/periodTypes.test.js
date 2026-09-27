/**
 * Are the three period-type lists still the same list?
 *
 *   server/models/CalendarPeriod.js       mongoose enum — rejects the save
 *   server/routes/workoutPlannerRoutes.js request validation — rejects the save
 *   client/src/utils/calendarThemes.js    the buttons and their colours
 *
 * A type added to one and not the others fails in a way nobody reads as a
 * missing enum entry: add it to the client alone and the button appears, then
 * Save returns 400; add it to the server alone and nothing appears at all. The
 * lists cannot be shared — one is a mongoose schema, one is an ES module the
 * server never loads — so they are compared here instead.
 *
 * Plain Node, no jest:  node server/routes/periodTypes.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function listFromArrayLiteral(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at > -1, `could not find ${marker}`);
  const open = src.indexOf('[', at);
  const close = src.indexOf(']', open);
  return [...src.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const modelTypes = listFromArrayLiteral(read('server/models/CalendarPeriod.js'), 'enum:');
const routeTypes = listFromArrayLiteral(read('server/routes/workoutPlannerRoutes.js'), 'const PERIOD_TYPES =');

const clientSrc = read('client/src/utils/calendarThemes.js');
const clientBlock = clientSrc.slice(clientSrc.indexOf('export const PERIOD_TYPES'));
const clientTypes = [...clientBlock.slice(0, clientBlock.indexOf('];')).matchAll(/type:\s*'([^']+)'/g)]
  .map((m) => m[1]);

assert.deepStrictEqual(
  [...routeTypes].sort(),
  [...modelTypes].sort(),
  'route validation and the mongoose enum disagree — one of them will reject a valid save',
);
assert.deepStrictEqual(
  [...clientTypes].sort(),
  [...modelTypes].sort(),
  'the buttons and the server disagree — a type is either unsaveable or invisible',
);

// Every type needs a colour, and no two may share one: the bands are read by
// colour alone on the month view, where there is no room for a label.
const colours = [...clientBlock.slice(0, clientBlock.indexOf('];')).matchAll(/color:\s*'(#[0-9a-fA-F]{6})'/g)]
  .map((m) => m[1]);
assert.strictEqual(colours.length, clientTypes.length, 'every type needs a colour');
assert.strictEqual(new Set(colours).size, colours.length, `two period types share a colour: ${colours}`);

assert.ok(modelTypes.length >= 7, `the lists agree but look truncated: ${modelTypes}`);
assert.ok(modelTypes.includes('Off season'), 'Off season is present');

console.log(`periodTypes: ${modelTypes.length} types agree across model, route and client`);
