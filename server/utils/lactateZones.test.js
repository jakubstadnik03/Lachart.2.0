/**
 * The server's zones (report e-mails, the profile write in applyZonesFromTest)
 * must be the client's: HR read off the test's own HR curve, and LT2 left
 * where the engine put it.
 */
const assert = require('assert');
const { calculateZonesFromTest } = require('./lactateZones');
const { calculateThresholds } = require('./lactateThresholds');

const bike = (rows) => ({
  sport: 'bike', baseLactate: 1.0,
  results: rows.map(([power, lactate, heartRate]) => ({ power, lactate, heartRate })),
});
const ZONES = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
function contiguous(zones, label) {
  ZONES.forEach((z, i) => {
    assert.ok(zones[z].max > zones[z].min, `${label} ${z} ${zones[z].min}-${zones[z].max}`);
    if (i > 0) assert.strictEqual(zones[z].min, zones[ZONES[i - 1]].max, `${label} gap before ${z}`);
  });
}

// HR flattens near the top: Z3 used to come out 149–151 bpm.
const plateau = calculateZonesFromTest(bike([[140, 1.0, 122], [170, 1.1, 133], [200, 1.4, 143], [230, 2.0, 151], [260, 3.1, 156], [290, 5.0, 158], [320, 8.2, 159]]));
contiguous(plateau.power, 'plateau power');
contiguous(plateau.heartRate, 'plateau HR');
assert.ok(plateau.heartRate.zone3.max - plateau.heartRate.zone3.min >= 4, JSON.stringify(plateau.heartRate.zone3));
assert.match(plateau.heartRateNote, /power is the better guide/);

// HR barely moves between the thresholds: no HR zones, and a reason.
const flat = calculateZonesFromTest(bike([[150, 1.2, 140], [180, 1.3, 138], [210, 1.6, 146], [240, 2.4, 150], [270, 3.8, 149], [300, 6.1, 160]]));
assert.strictEqual(flat.heartRate, null);
assert.match(flat.heartRateNote, /too little to tell the zones apart/);

// Thresholds under 20 W apart: LT2 is the engine's, not a raw-stage OBLA 3.5.
const lowPowerTest = bike([[60, 1.0, 104], [75, 1.1, 110], [90, 1.3, 118], [105, 2.0, 128], [120, 3.9, 139], [135, 6.8, 150]]);
const lowPower = calculateZonesFromTest(lowPowerTest);
assert.strictEqual(lowPower.lt2, calculateThresholds(lowPowerTest).LTP2);
assert.ok(lowPower.power.zone4.min < lowPower.lt2 && lowPower.power.zone4.max > lowPower.lt2);

console.log('lactateZones ok');
