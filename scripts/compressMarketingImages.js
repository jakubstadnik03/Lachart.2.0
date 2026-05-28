/* eslint-disable */
/**
 * Compress marketing / landing-page imagery in client/public/* in-place.
 *
 * Why this is separate from compressEmailImages.js:
 *   - Marketing assets are referenced from React components via <img src> (or
 *     CSS url(...)). Renaming PNG → JPG would require updating dozens of
 *     references and could break things. So this script KEEPS the original
 *     file extension — just re-encodes the content at higher compression
 *     within the same format.
 *
 *   - Marketing images can be larger (hero shots, walkthrough screenshots);
 *     max edge bumped from 1200 (email) to 1600 (still under 4K displays
 *     but big enough that a 2× retina render of a 800 px hero stays sharp).
 *
 * What this does, per file (in client/public/ recursively):
 *   • Skip files < 100 KB (already small enough).
 *   • Skip *.webp (responsive variants already optimised by a build step).
 *   • Skip favicon*, logo*, *-icon* (specific sizes / critical, hands off).
 *   • PNG → resize to ≤1600 wide, palette + max compression + adaptive filter.
 *   • JPG → resize to ≤1600 wide, mozjpeg quality 82, progressive.
 *
 * Re-runnable — already-compressed files get re-encoded at the same settings
 * and the output stays nearly identical.
 *
 * Run:    node scripts/compressMarketingImages.js
 * Dry-run: node scripts/compressMarketingImages.js --dry
 */

const fs = require('fs');
const path = require('path');
const sharp = require('./../server/node_modules/sharp');

const ROOT = path.resolve(__dirname, '..', 'client', 'public');
const MAX_EDGE = 1600;
const JPEG_QUALITY = 82;
const MIN_SIZE_BYTES = 100 * 1024; // skip < 100 KB

const SKIP_NAMES = /^(favicon|logo|apple-touch-icon|android-chrome|mstile|safari-pinned-tab|sitemap)/i;
const SKIP_EXT = /\.(webp|svg|ico|gif|json|xml|txt|html)$/i;

const isDry = process.argv.includes('--dry');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function shouldSkip(filepath, stats) {
  const base = path.basename(filepath);
  if (SKIP_EXT.test(base)) return 'ext';
  if (SKIP_NAMES.test(base)) return 'critical-name';
  if (!/\.(png|jpe?g)$/i.test(base)) return 'ext';
  if (stats.size < MIN_SIZE_BYTES) return 'too-small';
  return null;
}

async function compressOne(filepath) {
  const before = fs.statSync(filepath).size;
  const ext = path.extname(filepath).toLowerCase();
  const meta = await sharp(filepath).metadata();

  const needResize = Math.max(meta.width || 0, meta.height || 0) > MAX_EDGE;
  let pipeline = sharp(filepath).rotate();
  if (needResize) {
    pipeline = pipeline.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  if (ext === '.png') {
    pipeline = pipeline.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      effort: 10,
    });
  } else {
    pipeline = pipeline.jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      progressive: true,
    });
  }

  const buf = await pipeline.toBuffer();

  // Only write if we actually saved bytes — sometimes a highly-optimized
  // source file can grow after re-encode (rare on real screenshots, common
  // on already-quantized PNGs). Avoid a no-op rewrite.
  if (buf.length >= before) {
    return { filepath, before, after: before, saved: 0, skipped: 'no-gain', dims: `${meta.width}×${meta.height}` };
  }

  if (!isDry) fs.writeFileSync(filepath, buf);
  return {
    filepath,
    before,
    after: buf.length,
    saved: before - buf.length,
    resized: needResize,
    dims: needResize ? `${meta.width}×${meta.height} → ≤${MAX_EDGE}` : `${meta.width}×${meta.height}`,
  };
}

(async () => {
  const allFiles = walk(ROOT);
  const candidates = [];
  const skipped = { ext: 0, 'critical-name': 0, 'too-small': 0 };

  for (const f of allFiles) {
    const stats = fs.statSync(f);
    const why = shouldSkip(f, stats);
    if (why) {
      skipped[why]++;
    } else {
      candidates.push(f);
    }
  }

  console.log(`Scanned: ${allFiles.length} files in ${path.relative(process.cwd(), ROOT)}`);
  console.log(`Skipped: ${skipped.ext} non-image, ${skipped['critical-name']} critical (favicon/logo), ${skipped['too-small']} small (<100 KB)`);
  console.log(`Candidates: ${candidates.length}\n`);
  if (isDry) console.log('🔎 DRY RUN — no files will be written\n');

  let totalBefore = 0;
  let totalAfter = 0;
  let processed = 0;
  let noGain = 0;

  // Sort biggest-first so the user sees the wins immediately.
  candidates.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

  for (const f of candidates) {
    try {
      const r = await compressOne(f);
      totalBefore += r.before;
      totalAfter += r.after;
      const rel = path.relative(ROOT, r.filepath);
      if (r.skipped === 'no-gain') {
        noGain++;
        if (noGain <= 3) console.log(`  · ${rel.padEnd(50)} no-gain (already optimal)`);
        else if (noGain === 4) console.log('  · …');
        continue;
      }
      processed++;
      const savedPct = ((r.saved / r.before) * 100).toFixed(0);
      console.log(
        `  ${rel.padEnd(50)}`,
        (r.before / 1024).toFixed(1).padStart(8) + ' KB →',
        (r.after / 1024).toFixed(1).padStart(8) + ' KB',
        `(-${savedPct}%)`,
        '·',
        r.dims,
      );
    } catch (err) {
      console.error(`  ✗ ${f}: ${err.message}`);
    }
  }

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(
    `${isDry ? 'WOULD compress' : 'Compressed'}: ${processed} files (${noGain} unchanged)`,
  );
  console.log(
    'TOTAL'.padEnd(50),
    (totalBefore / 1024 / 1024).toFixed(2).padStart(7) + ' MB →',
    (totalAfter / 1024 / 1024).toFixed(2).padStart(7) + ' MB',
    `(-${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`,
  );
})();
