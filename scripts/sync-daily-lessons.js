#!/usr/bin/env node
/**
 * Generates app/src/coach/lessons.ts from client/src/content/dailyLessons.js.
 *
 * The Expo app ships the lesson bodies locally (the server sends only an index,
 * so the card still reads offline), which would otherwise mean maintaining the
 * same 30 lessons twice. Run this after editing the client file:
 *
 *     node scripts/sync-daily-lessons.js
 *
 * The server's LESSON_COUNT in utils/dailyCoachCard.js must match the length —
 * this script fails loudly if it doesn't.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'client/src/content/dailyLessons.js');
const TARGET = path.join(ROOT, 'app/src/coach/lessons.ts');
const SERVER_CARD = path.join(ROOT, 'server/utils/dailyCoachCard.js');

const source = fs.readFileSync(SOURCE, 'utf8');

// Pull just the array literal out and evaluate it in an empty sandbox — the rest
// of the module imports things Node can't resolve here, and we only need data.
const match = source.match(/export const DAILY_LESSONS = (\[[\s\S]*?\n\];)/);
if (!match) {
  console.error('Could not find DAILY_LESSONS array in', SOURCE);
  process.exit(1);
}

const lessons = vm.runInNewContext(`(${match[1].replace(/;$/, '')})`);
if (!Array.isArray(lessons) || !lessons.length) {
  console.error('DAILY_LESSONS parsed to something unusable');
  process.exit(1);
}

// The server picks the lesson by index modulo a hard-coded count. If the two
// disagree, web and phone show different lessons on the same day.
const serverSource = fs.readFileSync(SERVER_CARD, 'utf8');
const countMatch = serverSource.match(/const LESSON_COUNT = (\d+);/);
if (!countMatch) {
  console.error('Could not find LESSON_COUNT in', SERVER_CARD);
  process.exit(1);
}
if (Number(countMatch[1]) !== lessons.length) {
  console.error(
    `LESSON_COUNT mismatch: server says ${countMatch[1]}, client has ${lessons.length}.\n` +
    `Update LESSON_COUNT in server/utils/dailyCoachCard.js to ${lessons.length}.`
  );
  process.exit(1);
}

const body = lessons
  .map((l) => [
    '  {',
    `    tag: ${JSON.stringify(l.tag)},`,
    `    title: ${JSON.stringify(l.title)},`,
    `    body: ${JSON.stringify(l.body)},`,
    '  },',
  ].join('\n'))
  .join('\n');

const out = `/**
 * GENERATED FILE — do not edit.
 *
 * Source: client/src/content/dailyLessons.js
 * Regenerate: node scripts/sync-daily-lessons.js
 */

export type DailyLesson = {
  tag: string;
  title: string;
  body: string;
};

export const DAILY_LESSONS: DailyLesson[] = [
${body}
];
`;

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, out);
console.log(`Wrote ${lessons.length} lessons to ${path.relative(ROOT, TARGET)}`);
