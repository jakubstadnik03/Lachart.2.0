const path = require('path');

/**
 * Keep Puppeteer's browser download inside node_modules.
 *
 * Vercel restores node_modules from its build cache, which is why a repeat
 * build logs "up to date in 3s" — and why Puppeteer's postinstall, the step
 * that actually downloads Chrome, never runs again. The default cache lives at
 * ~/.cache/puppeteer, outside anything Vercel preserves, so every cached build
 * came up with no browser at all:
 *
 *   [prerender] ⚠ Chromium failed to launch
 *   Could not find Chrome (ver. 149.0.7827.22)
 *   ... cache path is (which is: /vercel/.cache/puppeteer)
 *
 * Pointing the cache at node_modules/.cache means the binary rides along in
 * the same cache as the dependency that wants it. scripts/prerender.js still
 * downloads on demand if it is missing, so a cold cache heals itself rather
 * than silently shipping an un-prerendered site.
 */
module.exports = {
  cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'puppeteer'),
};
