#!/usr/bin/env node
/**
 * Lists What's New demo videos — missing vs ready on disk.
 * Run: npm run whats-new:videos
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIDEO_DIR = path.join(ROOT, 'public/videos/whats-new');
const CONFIG = path.join(ROOT, 'src/content/whatsNewSlides.js');

const configSrc = fs.readFileSync(CONFIG, 'utf8');
const ids = [...configSrc.matchAll(/'(\d{2}-[\w-]+)':\s*(true|false)/g)].map((m) => ({
  id: m[1],
  enabled: m[2] === 'true',
}));

console.log('\nWhat\'s New videos — client/public/videos/whats-new/\n');
console.log('ID                      | soubor | enabled | status');
console.log('------------------------|--------|---------|--------');

let missing = 0;
let ready = 0;

for (const { id, enabled } of ids) {
  const file = path.join(VIDEO_DIR, `${id}.mp4`);
  const exists = fs.existsSync(file);
  if (exists) ready += 1;
  else missing += 1;

  const status = exists
    ? (enabled ? '✓ live' : '⚠ nahráno, ale enabled=false v configu')
    : '✗ chybí soubor';

  console.log(
    `${id.padEnd(23)} | ${(id + '.mp4').padEnd(6)} | ${String(enabled).padEnd(7)} | ${status}`,
  );
}

console.log(`\n${ready}/${ids.length} souborů na disku, ${missing} chybí.\n`);
console.log('Po nahrání: WHATS_NEW_VIDEOS_READY[id] = true v src/content/whatsNewSlides.js');
console.log('Návod: public/videos/whats-new/NATOČENÍ.md\n');

process.exit(missing > 0 ? 0 : 0);
