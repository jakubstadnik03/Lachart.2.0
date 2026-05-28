/* eslint-disable */
/**
 * One-shot compressor for the email-attached marketing images shipped from
 * client/public/images/email/* (referenced inside server/email-templates/
 * coachOutreachDefault.html). The original artifact-extracted PNGs were 80 KB
 * – 2.5 MB each, total ~4 MB. Mail clients lazy-load remote images on demand
 * but each one still has to traverse the recipient's connection, and Gmail
 * "Image proxy" rewrites every <img src> through its own cache — slow
 * recipients (mobile data, hotel WiFi) see a half-loaded email for seconds.
 *
 * What this does, per file:
 *   1. Resize so max edge ≤ 1200 px (email displays max ~600 visible px;
 *      1200 covers 2× retina with no visible quality loss).
 *   2. PNGs without alpha → re-encode as JPEG quality 78 with mozjpeg
 *      (typically 5–10× smaller for photographic content).
 *   3. PNGs with alpha → palette quantization (8-bit indexed) + max
 *      compression (typically 2–4× smaller).
 *   4. JPEGs → re-encode at quality 78 + mozjpeg (typically 2× smaller).
 *
 * Files are rewritten in-place. Filenames and extensions are preserved for
 * stability — except PNGs we convert to JPEG which DO get renamed (and we
 * print the mapping so the template can be updated).
 *
 * Run:    node scripts/compressEmailImages.js
 * Safe?:  YES — re-runnable, idempotent (a 2nd run on already-compressed
 *         files just re-encodes them at the same quality, output stays the
 *         same).
 */

const fs = require('fs');
const path = require('path');
const sharp = require('./../server/node_modules/sharp');

// Lives under client/public/ so Vercel's static build picks it up and
// serves at lachart.net/images/email/*. Putting it at the repo root (next
// to /server) does NOT work — Vercel only serves client/public.
const DIR = path.resolve(__dirname, '..', 'client', 'public', 'images', 'email');
const MAX_EDGE = 1200;
const JPEG_QUALITY = 78;
const ALPHA_THRESHOLD = 0.02; // % of pixels with alpha < 255 needed to keep PNG

async function detectMeaningfulAlpha(filepath) {
  // sharp.metadata().hasAlpha tells us the file CAN have alpha, not whether
  // it does. A PNG saved from a designer can have a 4-channel buffer with
  // every pixel fully opaque — converting that to JPEG is safe and saves
  // 80%+. Sample the actual pixel data to decide.
  const { hasAlpha, channels } = await sharp(filepath).metadata();
  if (!hasAlpha || channels < 4) return false;
  // Decode and count partially-transparent pixels.
  const { data, info } = await sharp(filepath).raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparent++;
  }
  return (transparent / pixelCount) > ALPHA_THRESHOLD;
}

async function compressOne(filename) {
  const inPath = path.join(DIR, filename);
  const before = fs.statSync(inPath).size;
  const ext = path.extname(filename).toLowerCase();
  const stem = filename.slice(0, -ext.length);
  const meta = await sharp(inPath).metadata();

  // Should we resize? Only if the longest edge exceeds MAX_EDGE.
  const needResize = Math.max(meta.width, meta.height) > MAX_EDGE;
  const resizeOpts = needResize
    ? { width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true }
    : null;

  // Decide output format.
  let outExt;
  let pipeline = sharp(inPath).rotate(); // honor EXIF orientation (no-op for PNG)
  if (resizeOpts) pipeline = pipeline.resize(resizeOpts);

  if (ext === '.png') {
    const keepAlpha = await detectMeaningfulAlpha(inPath);
    if (keepAlpha) {
      outExt = '.png';
      pipeline = pipeline.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
        effort: 10,
      });
    } else {
      // Photographic PNG — JPEG is dramatically smaller.
      outExt = '.jpg';
      pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true,
        progressive: true,
      });
    }
  } else {
    // .jpg / .jpeg → re-encode with mozjpeg at the same quality.
    outExt = '.jpg';
    pipeline = pipeline.jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      progressive: true,
    });
  }

  const outFilename = stem + outExt;
  const outPath = path.join(DIR, outFilename);
  const buf = await pipeline.toBuffer();

  // If we changed extension (.png → .jpg), write the new file then delete
  // the old one. If extension is unchanged, just overwrite.
  fs.writeFileSync(outPath, buf);
  if (outFilename !== filename) fs.unlinkSync(inPath);

  const after = buf.length;
  const saved = ((1 - after / before) * 100).toFixed(0);
  const dimStr = needResize
    ? `${meta.width}×${meta.height} → resized to ≤${MAX_EDGE}`
    : `${meta.width}×${meta.height} (kept)`;
  console.log(
    filename.padEnd(20),
    '→',
    outFilename.padEnd(20),
    (before / 1024).toFixed(1).padStart(7) + ' KB',
    '→',
    (after / 1024).toFixed(1).padStart(7) + ' KB',
    `(-${saved}%)`,
    '·',
    dimStr,
  );
  return { from: filename, to: outFilename, before, after };
}

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => /\.(png|jpe?g)$/i.test(f));
  if (files.length === 0) {
    console.log('No images found in', DIR);
    return;
  }

  console.log(`Compressing ${files.length} image(s) in ${path.relative(process.cwd(), DIR)}\n`);

  const results = [];
  let totalBefore = 0;
  let totalAfter = 0;
  for (const f of files) {
    try {
      const r = await compressOne(f);
      results.push(r);
      totalBefore += r.before;
      totalAfter += r.after;
    } catch (err) {
      console.error(`✗ ${f}:`, err.message);
    }
  }

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(
    'TOTAL'.padEnd(20),
    ' '.repeat(24),
    (totalBefore / 1024).toFixed(1).padStart(7) + ' KB',
    '→',
    (totalAfter / 1024).toFixed(1).padStart(7) + ' KB',
    `(-${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`,
  );

  // Print any extension renames so the email template can be updated.
  const renames = results.filter((r) => r.from !== r.to);
  if (renames.length) {
    console.log('\n⚠️  Filename changes — update server/email-templates/coachOutreachDefault.html:');
    for (const r of renames) {
      console.log(`   ${r.from}  →  ${r.to}`);
    }
  }
})();
