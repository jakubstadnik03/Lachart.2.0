# What's New — návod na natáčení videí

Videa pro modal **What's new** ulož sem jako `<videoId>.mp4`.
Po nahrání souboru zapni video v `client/src/content/whatsNewSlides.js` → `WHATS_NEW_VIDEOS_READY`.

## Technické požadavky

| Parametr | Hodnota |
|----------|---------|
| Formát | **MP4**, H.264 |
| Rozlišení | **1920×1200** nebo **1280×800** (stejný poměr stran jako modal 16:10) |
| Délka | **12–25 sekund** (loop — začátek = konec, plynulý přechod) |
| Zvuk | **Vypnuto** (modal přehrává muted) |
| Velikost | Cíl **≤ 3 MB** na video (HandBrake: RF 26–28, 720p stačí) |
| Kurzor | Zapnutý, pomalé pohyby, žádné zbytečné klikání |

### Export z QuickTime (macOS)

1. File → Export → 1080p
2. Nebo HandBrake preset „Web“ → max width 1280

### Kontrola chybějících souborů

```bash
cd client && npm run whats-new:videos
```

---

## Seznam videí k natočení

### `01-strava-connect.mp4` *(volitelné — stačí screenshot)*

**Kde:** Settings → Integrations  
**Co ukázat:**
1. Tlačítko „Connect Strava“
2. Klik → OAuth / connected stav
3. Krátký scroll na import historie nebo sync status

---

### `02-import-categorize.mp4` ⭐ priorita

**Kde:** Training nebo Calendar po syncu  
**Co ukázat:**
1. Seznam tréninků s barevnými kategoriemi (endurance / threshold / VO₂max)
2. Otevřít jeden trénink — viditelná auto-kategorie
3. (Volitelně) FIT upload nebo bulk re-categorize

---

### `03-analyze-workout.mp4` ⭐ priorita

**Kde:** Training → detail jednoho workoutu  
**Co ukázat:**
1. Graf power + HR
2. **Drag** přes segment grafu → zobrazení průměrů segmentu
3. Krátký scroll na lapy / intervaly

---

### `04-power-profile.mp4`

**Kde:** Training → Power profile / analytics  
**Co ukázat:**
1. Power-duration křivka
2. Klik na bod (např. 5 min) → skok na ten effort v historii

---

### `05-lactate-curve.mp4` ⭐ priorita

**Kde:** Testing → detail testu nebo Lactate curve  
**Co ukázat:**
1. Křivka s LT1 / LT2 čarami
2. Přepnutí overlay předchozího testu (compare)
3. Trend LT1/LT2 v čase (pokud je vidět)

---

### `06-training-zones.mp4`

**Kde:** Settings → Training zones nebo Zones generator  
**Co ukázat:**
1. Zóny odvozené z laktátu (power + HR)
2. Přepnutí bike / run / swim
3. Krátký scroll tabulky zón

---

### `07-plan-workout.mp4` *(coach)*

**Kde:** Workout planner  
**Co ukázat:**
1. Vytvoření intervalů (warm-up → work → recovery → cooldown)
2. Přiřazení target zone
3. Drop na den v kalendáři

---

### `08-live-workout.mp4`

**Kde:** Training calendar → planned workout → Live  
**Co ukázat:**
1. Start live session
2. Timer + target power/HR na aktuálním kroku
3. Přechod na další interval

---

### `09-lactate-interval.mp4`

**Kde:** Calendar → detail tréninku → interval  
**Co ukázat:**
1. Otevřít lap / interval
2. Přidat hodnotu laktátu (mmol/L)
3. Uložit → návrat na přehled

---

### `10-form-fitness.mp4`

**Kde:** Dashboard → Form & Fitness  
**Co ukázat:**
1. CTL / ATL / TSB čísla nahoře
2. Scroll grafu fitness + form
3. (Volitelně) přepnutí 60 / 90 dní

---

### `11-compare-tests.mp4`

**Kde:** Training nebo Testing → Compare  
**Co ukázat:**
1. Vybrat dva testy nebo dva workouty
2. Overlay na jednom grafu
3. Krátké porovnání metrik

---

### `12-pdf-branding.mp4` *(coach)*

**Kde:** Settings → Branding  
**Co ukázat:**
1. Upload loga + barva
2. Preview PDF reportu s brandingem
3. (Volitelně) Send to athlete

---

### `13-coach-squad.mp4` *(coach)*

**Kde:** Athletes + Dashboard jako coach  
**Co ukázat:**
1. Seznam atletů
2. Přepnutí mezi atlety (avatar bar)
3. Dashboard druhého atleta — jiná data

---

### `14-ios-app.mp4` *(volitelné — stačí screenshot iPhone)*

**Kde:** iPhone / simulátor  
**Co ukázat:**
1. Dashboard widget nebo home screen
2. Krátký swipe přes app
3. Live workout na watch (pokud máte záběr)

---

## Po nahrání

1. Soubor ulož jako `client/public/videos/whats-new/XX-nazev.mp4`
2. V `whatsNewSlides.js` nastav `WHATS_NEW_VIDEOS_READY['XX-nazev']: true`
3. Spusť `npm run whats-new:videos` pro kontrolu
4. Otevři modal přes ✨ v headeru

## Screenshoty (fallback)

Dokud video není hotové, modal ukáže `image` z konfigurace slide.
Nové screenshoty můžeš uložit do `client/public/screenshots/whats-new/` a cestu upravit v `whatsNewSlides.js`.
