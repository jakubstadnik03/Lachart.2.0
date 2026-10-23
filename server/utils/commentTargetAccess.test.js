/**
 * Who may use the comments under a training. Plain Node, no jest — run with:
 *
 *   node server/utils/commentTargetAccess.test.js
 */

'use strict';

const assert = require('assert');
const { mayUseTrainingComments, escapeHtml } = require('./commentTargetAccess');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const ATHLETE = '6aa11b0188d5f41d3ac40001';
const COACH = '6aa11b0188d5f41d3ac40002';
const STRANGER = '6aa11b0188d5f41d3ac40003';
const ownerDocs = [{ _id: ATHLETE, coachIds: [COACH] }];

test('the owner and their linked coach may', () => {
  assert.strictEqual(mayUseTrainingComments({ _id: ATHLETE, role: 'athlete' }, [ATHLETE], ownerDocs), true);
  assert.strictEqual(mayUseTrainingComments({ _id: COACH, role: 'coach' }, [ATHLETE], ownerDocs), true);
});

test('another coach or athlete may not', () => {
  assert.strictEqual(mayUseTrainingComments({ _id: STRANGER, role: 'coach' }, [ATHLETE], ownerDocs), false);
  assert.strictEqual(mayUseTrainingComments({ _id: STRANGER, role: 'athlete' }, [ATHLETE], ownerDocs), false);
});

test('an activity nobody owns is closed to everyone but admins', () => {
  assert.strictEqual(mayUseTrainingComments({ _id: COACH, role: 'coach' }, [], []), false);
  assert.strictEqual(mayUseTrainingComments({ _id: STRANGER, role: 'athlete', admin: true }, [], []), true);
});

test('comment text is escaped for the e-mail', () => {
  assert.strictEqual(escapeHtml('<a href="x">hi</a> & \'b\''), '&lt;a href=&quot;x&quot;&gt;hi&lt;/a&gt; &amp; &#39;b&#39;');
});

console.log(`${passed} passed`);
