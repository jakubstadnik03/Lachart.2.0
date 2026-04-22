/**
 * fast-equals@5 ships dist/esm/; some tooling still resolves dist/es/index.mjs
 * (e.g. react-smooth via recharts + CRA source-map-loader). Symlink dist/es -> esm.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'fast-equals', 'dist');
const esm = path.join(root, 'esm');
const es = path.join(root, 'es');
const codetrixEsmRoot = path.join(
  __dirname,
  '..',
  'node_modules',
  '@codetrix-studio',
  'capacitor-google-auth',
  'dist',
  'esm'
);

function patchCodetrixSourceMapWarnings() {
  const files = ['definitions.js', 'index.js', 'web.js'];

  files.forEach((fileName) => {
    const filePath = path.join(codetrixEsmRoot, fileName);
    if (!fs.existsSync(filePath)) return;

    const source = fs.readFileSync(filePath, 'utf8');
    const patched = source
      .split('\n')
      .filter((line) => !line.includes('sourceMappingURL='))
      .join('\n');

    if (patched !== source) {
      fs.writeFileSync(filePath, patched, 'utf8');
    }
  });
}

try {
  if (fs.existsSync(esm)) {
    let needsSymlink = true;
    if (fs.existsSync(es)) {
      const st = fs.lstatSync(es);
      if (st.isSymbolicLink() || st.isDirectory()) {
        needsSymlink = false;
      }
    }
    if (needsSymlink) {
      fs.symlinkSync('esm', es, 'dir');
    }
  }
} catch (e) {
  // Windows / permissions: non-fatal
  if (process.env.DEBUG_FAST_EQUALS_SHIM) {
    console.warn('[fix-fast-equals-shim]', e.message);
  }
}

try {
  patchCodetrixSourceMapWarnings();
} catch (e) {
  if (process.env.DEBUG_FAST_EQUALS_SHIM) {
    console.warn('[patch-codetrix-source-map]', e.message);
  }
}
