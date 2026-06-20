/**
 * Capacitor 6 resolves packageClassList via NSClassFromString("HealthPlugin"),
 * which fails for Swift pod classes. Use the module-qualified name so auto-discovery works
 * even without MainViewController manual registration.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configPath = path.join(root, 'ios/App/App/capacitor.config.json');

if (!fs.existsSync(configPath)) {
  console.warn('[patch-ios-health] Skipped — no ios/App/App/capacitor.config.json');
  process.exit(0);
}

const cap = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const list = [...(cap.packageClassList || [])];
const qualified = 'CapgoCapacitorHealth.HealthPlugin';
const localPlugins = ['LaChartHealthPlugin', 'LaChartSharedPlugin', 'LaChartWatchSyncPlugin', 'LaChartWorkoutPlanPlugin'];

const next = list
  .filter((entry) => entry !== 'HealthPlugin' && entry !== qualified)
  .concat([qualified, ...localPlugins.filter((p) => !list.includes(p))]);

cap.packageClassList = next;
fs.writeFileSync(configPath, `${JSON.stringify(cap, null, '\t')}\n`);
console.log('[patch-ios-health] packageClassList →', qualified);
