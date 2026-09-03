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
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const PORT = 4321;

// Only public, unauthenticated pages — these are the ones Google indexes
// and the ones whose canonical/title/description need to be unique per URL.
// Add new public routes here when you ship them.
const PRERENDER_ROUTES = [
  '/',
  '/about',

  // The three job pages. /for-testers and /for-athletes shipped without being
  // added here, which meant crawlers got the generic index.html shell — every
  // title, description and canonical on them was invisible without JS.
  '/for-coaches',
  '/for-testers',
  '/for-athletes',

  // Feature pages — one per capability, each with its own meta + JSON-LD.
  '/features',
  '/features/analytics',
  '/features/planning',
  '/features/lactate-testing',
  '/features/training-zones',
  '/features/load-and-form',
  '/features/health',
  '/features/integrations',
  '/features/coaching',

  // Comparison pages. These are the highest-intent public URLs on the site —
  // a reader who typed "trainingpeaks alternative" is mid-decision — so they
  // matter more than most here, not less. Each carries FAQPage JSON-LD that
  // only exists once the page has rendered.
  '/trainingpeaks-alternative',
  '/coachbox-alternative',
  '/lachart-vs-trainingpeaks',

  '/how-to-use',
  '/tutorials',
  '/privacy',
  '/terms',
  // '/documentation' deliberately absent: internal frontend docs, now noindex.

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
  '/blog/lactate-testing-software-for-coaches',
  '/blog/what-is-vlamax',
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

/* A skipped or half-working prerender is invisible: the build goes green, the
   SPA ships, and every route quietly serves the same <title> until someone
   thinks to curl the site as Googlebot. That is exactly how lachart.net spent
   an extended stretch with no per-page meta in production at all. Every exit
   path that leaves the site un-prerendered now says so in a banner you cannot
   scroll past, and a real regression fails the build rather than shipping. */
function banner(lines) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const bar = '─'.repeat(width);
  console.warn(`\n┌${bar}┐`);
  for (const l of lines) console.warn(`│  ${l.padEnd(width - 4)}  │`);
  console.warn(`└${bar}┘\n`);
}

(async () => {
  // Escape hatch for an environment that genuinely cannot run a browser.
  // It should almost never be needed: the usual failure was "Could not find
  // Chrome" on Vercel cache-hit builds, and prerenderRoute now downloads the
  // browser on demand instead of giving up. Setting this ships the SPA with
  // no per-page meta at all, so treat it as a last resort, not a workaround.
  if (process.env.SKIP_PRERENDER === 'true' || process.env.SKIP_PRERENDER === '1') {
    banner([
      'SKIP_PRERENDER is set — SHIPPING WITHOUT PRE-RENDERED HTML.',
      '',
      'Every route will serve the same <title>, no canonical and no',
      'per-page description. Crawlers that do not execute JS see one',
      'page. Unset SKIP_PRERENDER once the build image can run Chromium.',
    ]);
    process.exit(0);
  }

  // The shell <title>, read from the source template rather than from
  // build/index.html — prerender overwrites the latter with the "/" snapshot,
  // so on any rebuild over a warm build/ directory it already holds the
  // homepage title and would make the check below compare against itself.
  // A route still carrying this title after prerender never got its Helmet.
  const baseTitle = (() => {
    try {
      const m = fs
        .readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8')
        .match(/<title[^>]*>(.*?)<\/title>/is);
      return m ? m[1].trim() : null;
    } catch {
      return null;
    }
  })();

  console.log(`[prerender] Starting static server on :${PORT}…`);
  const server = await startServer();

  console.log('[prerender] Launching headless Chromium…');
  const LAUNCH_OPTS = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  let browser;
  try {
    try {
      browser = await puppeteer.launch(LAUNCH_OPTS);
    } catch (first) {
      // "Could not find Chrome" is not a broken environment, it is a missing
      // download — and on Vercel it is the normal state of every cache-hit
      // build, because npm skips puppeteer's postinstall when node_modules
      // comes back from cache. Fetch the browser and carry on rather than
      // shipping a site with no meta on it.
      if (!/Could not find Chrome|Could not find browser/i.test(first?.message || '')) throw first;

      console.log('[prerender] No browser found — downloading Chrome for Puppeteer…');
      execSync('npx --no-install puppeteer browsers install chrome', {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
      });
      browser = await puppeteer.launch(LAUNCH_OPTS);
    }
  } catch (e) {
    // Chromium could not be started even after trying to fetch it — /tmp full,
    // sandbox disabled, a genuinely missing system library. Non-fatal by
    // design: log loudly and exit 0 so the build still ships, because
    // pre-rendered HTML is an SEO layer and the SPA works without it.
    //
    // The one cause this is NOT any more is a missing download. That was the
    // real story behind months of un-prerendered production: Vercel restores
    // node_modules from cache, npm therefore skips puppeteer's postinstall,
    // and the browser was never fetched. Handled above, plus .puppeteerrc.cjs
    // now parks the download inside node_modules so it survives the cache.
    banner([
      'CHROMIUM FAILED TO LAUNCH — SHIPPING WITHOUT PRE-RENDERED HTML.',
      '',
      `Underlying error: ${(e?.message || String(e)).slice(0, 120)}`,
      '',
      'The site will serve one <title> for every route to any crawler that',
      'does not execute JS. A missing browser is downloaded automatically, so',
      'this means the build machine cannot run Chrome at all — check the error.',
    ]);
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

  /* Writing the files is not the same as writing the meta. react-helmet only
     flushes to <head> once an instance has mounted outside a lazy boundary
     (see <HeadDefaults> in src/App.jsx); when that broke, prerender still
     reported ✓ on every route while emitting the CRA shell title on all of
     them. Serialising HTML is cheap to verify, so verify it. */
  const offenders = [];
  for (const route of PRERENDER_ROUTES.filter((r) => r !== '/')) {
    const file = path.join(BUILD_DIR, route.replace(/^\//, ''), 'index.html');
    let html;
    try {
      html = fs.readFileSync(file, 'utf8');
    } catch {
      offenders.push(`${route} — not written`);
      continue;
    }
    const title = (html.match(/<title[^>]*>(.*?)<\/title>/is) || [, ''])[1].trim();
    // Duplicates matter as much as absences: react-helmet appends rather than
    // replaces anything it did not create, so a stray static tag in
    // public/index.html sits in front of the page's own and wins with every
    // crawler that reads the first match.
    const dupes = ['name="description"', 'property="og:title"', 'property="og:description"']
      .filter((attr) => (html.match(new RegExp(`<meta[^>]*${attr}`, 'gi')) || []).length > 1);

    if (!title || (baseTitle && title === baseTitle)) {
      offenders.push(`${route} — still the shell <title>`);
    } else if (!/rel="canonical"/i.test(html)) {
      offenders.push(`${route} — no canonical`);
    } else if (dupes.length) {
      offenders.push(`${route} — duplicate ${dupes.join(', ')}`);
    }
  }

  if (offenders.length) {
    banner([
      `PRE-RENDER PRODUCED ${offenders.length} PAGE(S) WITH NO PER-ROUTE META.`,
      '',
      ...offenders.slice(0, 8),
      ...(offenders.length > 8 ? [`…and ${offenders.length - 8} more`] : []),
      '',
      'The files exist but carry the shell <title>, so every one of them is',
      'the same page to a crawler. Usual cause: a <Helmet> that only mounts',
      'inside React.lazy. Check <HeadDefaults> is still rendered in App.jsx.',
    ]);
    process.exitCode = 1;
  } else {
    console.log(
      `[prerender] Verified per-route <title> + canonical on ${PRERENDER_ROUTES.length - 1} pages.`
    );
  }

  console.log('[prerender] Done.');
})();
