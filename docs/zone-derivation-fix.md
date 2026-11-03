# Why a lactate test could give a 1 bpm Zone 3, and what changed

A trial user's test produced a heart-rate Zone 3 one or two beats wide, "among other oddities", and he got usable zones by pasting the same numbers into a chatbot. The thresholds were fine. The zone arithmetic built on top of them was not.

## Causes

### 1. HR zones were power percentages multiplied into beats (the 1 bpm Zone 3)

`ltZoneBounds` builds five zones from LT1 and LT2 using fixed fractions: Z1/Z2 at 0.80 × LT1, and Z4 from 0.97 × LT2 to 1.03 × LT2. Every caller then ran the **same function on the two threshold heart rates** to get HR zones.

That works for watts and pace, where LT2 is usually 15–30 % above LT1. It fails for heart rate: LT2 HR is usually only 4–8 % above LT1 HR, and much less when HR flattens near the top of the test. So "3 % under LT2 HR" lands at or below LT1 HR:

| | LT1 | LT2 | 0.97 × LT2 | Z3 = LT1 … 0.97 × LT2 |
|---|---|---|---|---|
| power | 224 W | 265 W | 257 W | 33 W wide |
| HR | 149 bpm | 156 bpm | 151 bpm | **2 bpm wide** |

Where 0.97 × LT2 fell below LT1, `enforceOrder` nudged it to LT1 + 1, which is where the "Zone 3 = 1 bpm" came from.

The same mistake also made HR zones disagree with the power zones elsewhere. HR Z2 started at 0.80 × LT1 HR (117 bpm on a typical ride), but at the bottom of power Z2 (188 W) that rider's measured HR was 130 bpm. A ride held in power Z1 showed as Z2 on the strap.

### 2. Close thresholds collapsed power Z3 too

The threshold band (±3 % of LT2) is not limited by the LT1–LT2 gap. When the engine had to hold LT2 just 4 % above LT1 (coarse stages), power Z3 came out 1–2 W wide for the same reason.

### 3. The profile and the test page used different LT2s and different zone shapes

- `resolveLtAnchorsFromTest` (client) and `lactateZones.js` (server) swapped LT2 for the raw-stage OBLA 3.5 or IAT whenever LT1 and LT2 were under 20 W apart. That rule predates the threshold engine, which already keeps the thresholds apart and lowers confidence when it has to. The swap meant the **saved profile zones were built around a different LT2 from the one the page showed**. One sample: the page showed LT2 at 118 W while the profile used 131 W.
- `TrainingZonesGenerator` (the zone table on the test page, which also has a "save to profile" button) used its own shape. Z1 started at 0.50 × LT1 instead of 0.70 × LT1, Z5 ended at 1.20 × LT2 instead of 1.50 × LT2, and HR Z5 was capped differently. So the same test showed one table on the page and saved another.
- That table's labels were stale: "< 90 % LT1", "LT2 – 104 % LT2", "> 104 % LT2". The numbers next to them were 80 % LT1 and LT2 ± 3 %.

### 4. Threshold HR came from raw stage interpolation

When a stage's HR read lower than the stage before (strap noise, or a stage too short for HR to settle), the HR shown at LT2 could be lower than HR already measured at an easier stage.

## What changed

- **HR is read off the athlete's own HR curve.** The engine (`lactateThresholdEngine.js`) now builds one monotone HR-vs-intensity polyline from the stages. It pools dips the same way it already pools lactate dips. It returns the polyline as `heartRateCurve`. LT1/LT2 HR and every HR zone edge are read off this curve.
- **HR zones = the power/pace zones expressed in beats** (`heartRateZoneBoundsFromTest` in `trainingZoneBounds.js`, client and server copies). Each edge between zones is the HR this athlete had at that edge's watts or pace in this test. The bottom of Z1 and the top of Z5 are conventions, not readings, and keep their existing rules.
- **A sensible minimum, and a plain warning when HR can't do the job:**
  - Z2, Z3 and Z4 are each at least 4 bpm wide, and Z4 reaches at least ±2 bpm around LT2 HR. A strap drifts about that much within one steady effort.
  - When the test's own HR could not give Z4 that much (HR plateau), the screen says so and suggests power or pace above LT2.
  - When HR rose under 6 bpm between LT1 and LT2, the test cannot separate Z3 from Z4 by heart rate. **No HR zones are drawn or saved**, and the screen says why (for example "Heart rate rose only 3 bpm between LT1 (147) and LT2 (150) in this test — too little to tell the zones apart by heart rate. Train Z2–Z4 by power from this test."). The profile's existing HR zones are left alone in that case.
- **The threshold band is capped at a third of the LT1–LT2 gap**, so Z3 always keeps at least two thirds of the gap. On tests whose thresholds are more than about 9 % apart (nearly all of them) nothing changes.
- **One LT2, one shape.**
  - The 20 W / 8 % LT2 swap now runs only on the legacy pipeline. With the engine, the profile, the e-mailed report and the page all use the engine's LT2.
  - The test-page table uses the shared zone shape (`TOP_FACTOR`, 0.70 floor), and its labels now describe the numbers next to them.
- The HR note is shown under the threshold confidence on the curve page and above the zone table. It is returned as `heartRateNote` from `calculateZonesFromTest` (client and server).

The lactate-threshold methods themselves (LT1 baseline + shape blend, LT2 median of OBLA 4 / modified D-max / IAT) were not changed. Across the samples below, LT1 and LT2 come out identical before and after.

### Behaviour change to expect

On a normal test, HR Z1/Z2 moves up, and so does the top of HR Z3. On the typical ride below, Z2 now starts at 130 bpm instead of 117. That is the HR the rider measured at the bottom of power Z2. Step-test HR lags behind steady-state HR, so if anything these edges are slightly conservative. Saved profiles only change when zones are regenerated from a test.

## Tests

- `client/src/utils/trainingZoneBounds.test.js`: monotone and contiguous zones across the LT2/LT1 ratio sweep for power and pace; close-threshold Z3; the HR curve (pooling, extrapolation, plateau); HR zones on nine sample tests (typical, HR plateau, HR not monotone, coarse adjacent LT1/LT2, noisy first stage with flat early lactate, low-power rider, four steps, run, run with flat HR); HR edge = measured HR at the power edge; no-HR tests.
- `client/src/components/Testing-page/zoneCalculator.test.js`: end to end through `calculateThresholds`. Profile LT2 = page LT2; plateau and flat-HR notes; manual overrides.
- `server/utils/lactateZones.test.js`: the same checks on the server path (report e-mails, `applyZonesFromTest`).

## Before / after on sample tests

"Test page, before" is the zone table on the test page (`TrainingZonesGenerator`). "Profile, before" is what `calculateZonesFromTest` saved and e-mailed. After the fix, both are the same table.

#### A typical 7-step ride

Thresholds — before: LT1 235 W @ 146 bpm, LT2 280 W @ 163 bpm; after: LT1 235 W @ 146 bpm, LT2 280 W @ 163 bpm (confidence 82)

| Zone | W (test page, before) | W (profile, before) | W (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | 118–188 | 165–188 | 165–188 | 73–117 | 102–117 | 102–130 |
| Z2 | 188–235 | 188–235 | 188–235 | 117–146 | 117–146 | 130–146 |
| Z3 | 235–272 | 235–272 | 235–272 | 146–158 | 146–158 | 146–160 |
| Z4 | 272–289 | 272–289 | 272–289 | 158–168 | 158–168 | 160–166 |
| Z5 | 289–336 | 289–420 | 289–420 | 168–179 | 168–183 | 166–183 |

#### B HR plateaus near the top

Thresholds — before: LT1 224 W @ 149 bpm, LT2 265 W @ 156 bpm; after: LT1 224 W @ 149 bpm, LT2 265 W @ 156 bpm (confidence 87)

| Zone | W (test page, before) | W (profile, before) | W (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | 112–179 | 157–179 | 157–179 | 75–119 | 104–119 | 105–136 |
| Z2 | 179–224 | 179–224 | 179–224 | 119–149 | 119–149 | 136–149 |
| Z3 | 224–257 | 224–257 | 224–257 | 149–151 | 149–151 | 149–154 |
| Z4 | 257–273 | 257–273 | 257–273 | 151–161 | 151–161 | 154–158 |
| Z5 | 273–318 | 273–397 | 273–397 | 161–172 | 161–175 | 158–175 |

After, shown on screen: _Heart rate rose only 1 bpm across the threshold zone in this test, so HR Z4 is set to LT2 HR ±2 bpm. Above LT2, power is the better guide._

#### C HR not strictly increasing

Thresholds — before: LT1 217 W @ 147 bpm, LT2 260 W @ 149 bpm; after: LT1 217 W @ 147 bpm, LT2 260 W @ 150 bpm (confidence 77)

| Zone | W (test page, before) | W (profile, before) | W (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | 109–174 | 152–174 | 152–174 | 74–118 | 103–118 | — |
| Z2 | 174–217 | 174–217 | 174–217 | 118–147 | 118–147 | — |
| Z3 | 217–252 | 217–252 | 217–252 | 147–148 | 147–148 | — |
| Z4 | 252–267 | 252–267 | 252–267 | 148–153 | 148–153 | — |
| Z5 | 267–312 | 267–389 | 267–389 | 153–164 | 153–167 | — |

After, shown on screen: _Heart rate rose only 3 bpm between LT1 (147) and LT2 (150) in this test — too little to tell the zones apart by heart rate. Train Z2–Z4 by power from this test._

#### D coarse steps, LT1/LT2 adjacent

Thresholds — before: LT1 210 W @ 141 bpm, LT2 239 W @ 152 bpm; after: LT1 210 W @ 141 bpm, LT2 239 W @ 152 bpm (confidence 65)

| Zone | W (test page, before) | W (profile, before) | W (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | 105–168 | 147–168 | 147–168 | 71–113 | 99–113 | 99–127 |
| Z2 | 168–210 | 168–210 | 168–210 | 113–141 | 113–141 | 127–141 |
| Z3 | 210–232 | 210–232 | 210–232 | 141–147 | 141–147 | 141–149 |
| Z4 | 232–246 | 232–246 | 232–246 | 147–157 | 147–157 | 149–154 |
| Z5 | 246–287 | 246–359 | 246–359 | 157–167 | 157–170 | 154–170 |

#### E noisy first step, flat early lactate

Thresholds — before: LT1 235 W @ 147 bpm, LT2 275 W @ 160 bpm; after: LT1 235 W @ 147 bpm, LT2 275 W @ 160 bpm (confidence 79)

| Zone | W (test page, before) | W (profile, before) | W (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | 117–188 | 164–188 | 164–188 | 74–118 | 103–118 | 103–132 |
| Z2 | 188–235 | 188–235 | 188–235 | 118–147 | 118–147 | 132–147 |
| Z3 | 235–267 | 235–267 | 235–267 | 147–155 | 147–155 | 147–158 |
| Z4 | 267–284 | 267–284 | 267–284 | 155–165 | 155–165 | 158–163 |
| Z5 | 284–330 | 284–413 | 284–413 | 165–176 | 165–179 | 163–180 |

#### F low-power rider, thresholds <20 W apart

Thresholds — before: LT1 101 W @ 125 bpm, LT2 118 W @ 138 bpm; after: LT1 101 W @ 125 bpm, LT2 118 W @ 138 bpm (confidence 80)

| Zone | W (test page, before) | W (profile, before) | W (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | 50–81 | 71–81 | 71–81 | 63–100 | 88–100 | 88–113 |
| Z2 | 81–101 | 81–101 | 81–101 | 100–125 | 100–125 | 113–125 |
| Z3 | 101–115 | 101–131 | 101–115 | 125–134 | 125–146 | 125–135 |
| Z4 | 115–122 | 131–139 | 115–122 | 134–142 | 146–155 | 135–140 |
| Z5 | 122–142 | 139–203 | 122–177 | 142–152 | 155–168 | 140–154 |

#### G only 4 steps

Thresholds — before: LT1 194 W @ 143 bpm, LT2 253 W @ 161 bpm; after: LT1 194 W @ 143 bpm, LT2 253 W @ 161 bpm (confidence 72)

| Zone | W (test page, before) | W (profile, before) | W (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | 97–155 | 136–155 | 136–155 | 72–114 | 100–114 | 100–130 |
| Z2 | 155–194 | 155–194 | 155–194 | 114–143 | 114–143 | 130–143 |
| Z3 | 194–245 | 194–245 | 194–245 | 143–156 | 143–156 | 143–159 |
| Z4 | 245–260 | 245–260 | 245–260 | 156–166 | 156–166 | 159–163 |
| Z5 | 260–303 | 260–379 | 260–379 | 166–177 | 166–180 | 163–180 |

#### H typical run (min/km)

Thresholds — before: LT1 4:54/km @ 150 bpm, LT2 4:18/km @ 164 bpm; after: LT1 4:54/km @ 150 bpm, LT2 4:18/km @ 164 bpm (confidence 81)

| Zone | pace /km (test page, before) | pace /km (profile, before) | pace /km (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | (see profile) | 6:59–6:07 | 6:59–6:07 | 75–120 | 105–120 | 105–130 |
| Z2 | (see profile) | 6:07–4:54 | 6:07–4:54 | 120–150 | 120–150 | 130–150 |
| Z3 | (see profile) | 4:54–4:26 | 4:54–4:26 | 150–159 | 150–159 | 150–160 |
| Z4 | (see profile) | 4:26–4:10 | 4:26–4:10 | 159–169 | 159–169 | 160–167 |
| Z5 | (see profile) | 4:10–3:18 | 4:10–3:18 | 169–180 | 169–184 | 167–184 |

#### I run, HR flattens above LT1

Thresholds — before: LT1 5:14/km @ 154 bpm, LT2 4:45/km @ 157 bpm; after: LT1 5:14/km @ 154 bpm, LT2 4:45/km @ 157 bpm (confidence 76)

| Zone | pace /km (test page, before) | pace /km (profile, before) | pace /km (after, everywhere) | HR test page before | HR profile before | HR after |
|---|---|---|---|---|---|---|
| Z1 | (see profile) | 7:28–6:32 | 7:28–6:32 | 77–123 | 108–123 | — |
| Z2 | (see profile) | 6:32–5:14 | 6:32–5:14 | 123–154 | 123–154 | — |
| Z3 | (see profile) | 5:14–4:54 | 5:14–4:54 | 154–155 | 154–155 | — |
| Z4 | (see profile) | 4:54–4:37 | 4:54–4:37 | 155–162 | 155–162 | — |
| Z5 | (see profile) | 4:37–3:39 | 4:37–3:39 | 162–173 | 162–176 | — |

After, shown on screen: _Heart rate rose only 3 bpm between LT1 (154) and LT2 (157) in this test — too little to tell the zones apart by heart rate. Train Z2–Z4 by pace from this test._
