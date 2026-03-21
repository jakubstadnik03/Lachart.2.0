/**
 * fast-equals@5 ships dist/esm/; some tooling still resolves dist/es/index.mjs
 * (e.g. react-smooth via recharts + CRA source-map-loader). Symlink dist/es -> esm.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'fast-equals', 'dist');
const esm = path.join(root, 'esm');
const es = path.join(root, 'es');

try {
  if (!fs.existsSync(esm)) {
    process.exit(0);
  }
  if (fs.existsSync(es)) {
    const st = fs.lstatSync(es);
    if (st.isSymbolicLink() || st.isDirectory()) {
      process.exit(0);
    }
  }
  fs.symlinkSync('esm', es, 'dir');
} catch (e) {
  // Windows / permissions: non-fatal
  if (process.env.DEBUG_FAST_EQUALS_SHIM) {
    console.warn('[fix-fast-equals-shim]', e.message);
  }
}
