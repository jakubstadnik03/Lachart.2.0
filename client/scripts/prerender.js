/* eslint-disable */
/**
 * Build-time pre-renderer.
 *
 * Why: lachart.net is a CRA SPA. Without this step every route ships the same
 * <title>, <meta description>, and (worse) the same <link rel="canonical"> to
 * "/" — which causes Google to merge all calculator + blog pages into the
 * homepage in its index. Confirmed via curl-as-Googlebot in May 2026.
 *
 * What this does:
 *   1. Spins up a static file server pointed at ./build (the CRA output).
 *   2. Launches headless Chromium via Puppeteer.
 *   3. For each route in PRERENDER_ROUTES, visits the URL, waits for
 *      networkidle0 (i.e. React + react-helmet have settled), and serializes
 *      the fully-rendered DOM back to disk as build/<route>/index.html.
 *   4. Static hosts (Vercel / Render / Nginx) will then serve the pre-rendered
 *      HTML on first hit — crawlers see real <title>/<meta>/<canonical>
 *      without needing to execute JS.
 *
 * The client-side React still hydrates on top, so live navigation, auth, etc.
 * keep working exactly as before. This is purely an SEO layer.
 *
 * Run automatically via the "postbuild" npm hook (see package.json), or
 * manually after a build with `node scripts/prerender.js`.
 *
 * Routes are an explicit allow-list (not crawled). That's intentional —
 * authenticated routes (/dashboard, /settings, /training/*) MUST NOT be
 * pre-rendered or we'd ship an empty logged-out shell for the cached HTML.
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');
const handler = require('serve-handler');
const puppeteer = require('puppeteer');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const PORT = 4321;

// Only public, unauthenticated pages — these are the ones Google indexes
// and the ones whose canonical/title/description need to be unique per URL.
// Add new public routes here when you ship them.
const PRERENDER_ROUTES = [
  '/',
  '/about',
  '/how-to-use',
  '/tutorials',
  '/privacy',
  '/terms',
  '/documentation',

  // Calculators — the SEO-critical bunch
  '/lactate-curve-calculator',
  '/ftp-calculator',
  '/vo2max-calculator',
  '/race-predictor',
  '/tss-calculator',
  '/training-zones-calculator',
  '/zone2-calculator',
  '/heat-altitude-calculator',
  '/weight-calculator',

  // Blog hub + posts
  '/lactate-guide',
  '/lactate-guide/classic',
  '/blog/how-lachart-calculates-lt1-lt2',
  '/blog/lactate-testing-protocol-guide',
  '/blog/lt1-vs-lt2-training-zones',
  '/blog/obla-dmax-iat-methods-compared',
  '/blog/lactate-test-at-home',
  '/blog/lactate-test-interpretation',
  '/blog/ftp-vs-lt2',
  '/blog/best-lactate-analyzer-2026',
  '/blog/zone-2-training-lactate',
  '/blog/lactate-threshold-heart-rate',
];

async function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // serve-handler resolves React Router 404s back to index.html so the
      // SPA can take over and render the requested route client-side; that's
      // exactly what we want — we then snapshot the rendered DOM.
      return handler(req, res, {
        public: BUILD_DIR,
        rewrites: [{ source: '**', destination: '/index.html' }],
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function prerenderRoute(browser, route) {
  const page = await browser.newPage();
  // Mimic a normal viewport so any responsive layout reads correctly during
  // hydration — some components measure window size on mount and could
  // otherwise render empty placeholders.
  await page.setViewport({ width: 1280, height: 800 });

  // Block third-party tracking + analytics during pre-render so Google
  // Analytics, AdSense, etc. don't fire phantom pageviews when we crawl
  // ourselves at build time.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (
      url.includes('googletagmanager.com') ||
      url.includes('google-analytics.com') ||
      url.includes('googlesyndication.com') ||
      url.includes('doubleclick.net') ||
      url.includes('vercel-insights') ||
      url.includes('vercel-analytics')
    ) {
      return req.abort();
    }
    return req.continue();
  });

  const url = `http://localhost:${PORT}${route}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });

  // Give react-helmet's microtask flush one more tick after networkidle —
  // helmet writes to <head> in a useEffect, which can lag a frame behind the
  // last network response.
  await new Promise((r) => setTimeout(r, 250));

  // Strip the inline app bundle script tags? No — we want to KEEP them so
  // hydration works when the static HTML is loaded. We just serialize the
  // current document including head + body + scripts.
  const html = await page.content();

  // Write to build/<route>/index.html  — using a directory + index.html so
  // static hosts that don't try .html extension fallback still serve it.
  const outDir =
    route === '/'
      ? BUILD_DIR
      : path.join(BUILD_DIR, route.replace(/^\//, ''));
  fs.mkdirSync(outDir, { recursive: true });
  // For "/" we'd be overwriting the original CRA-generated index.html with
  // the homepage-snapshot — that's intentional, the snapshot has the correct
  // root-route <title>/<meta>.
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  await page.close();
  return outDir;
}

(async () => {
  // Allow CI environments to skip prerender entirely. Vercel's build image
  // periodically loses Chromium runtime deps (e.g. libnspr4.so), which used
  // to hard-fail the whole deploy. SKIP_PRERENDER=true exits successfully
  // so the SPA still ships — SEO falls back to runtime React.
  if (process.env.SKIP_PRERENDER === 'true' || process.env.SKIP_PRERENDER === '1') {
    console.log('[prerender] SKIP_PRERENDER set — skipping prerender, exiting 0.');
    process.exit(0);
  }

  console.log(`[prerender] Starting static server on :${PORT}…`);
  const server = await startServer();

  console.log('[prerender] Launching headless Chromium…');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (e) {
    // Chromium failed to launch (missing libnspr4.so on Vercel, /tmp full,
    // sandbox disabled, …). Treat as non-fatal: log and exit 0 so the build
    // ships. Pre-rendered HTML is purely an SEO layer — without it the SPA
    // still works, Google just falls back to executing JS. To re-enable
    // prerender on Vercel, install @sparticuz/chromium and rewrite this
    // launch call to use its executablePath().
    console.warn(
      '[prerender] ⚠ Chromium failed to launch — shipping SPA without pre-rendered HTML.\n' +
      '            Underlying error:', e?.message || e
    );
    try { server.close(); } catch {}
    process.exit(0);
  }

  try {
    for (const route of PRERENDER_ROUTES) {
      const t0 = Date.now();
      try {
        const out = await prerenderRoute(browser, route);
        console.log(
          `[prerender] ✓ ${route.padEnd(45)}  →  ${path.relative(
            BUILD_DIR,
            out
          )}/index.html  (${Date.now() - t0} ms)`
        );
      } catch (e) {
        console.error(`[prerender] ✗ ${route}: ${e.message}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('[prerender] Done.');
})();
