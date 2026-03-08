# Logika hodnocení LT1 a LT2 (LTP1, LTP2) v LaChart

Aplikace používá **více metod najednou** a podle sportu a počtu bodů vybírá výsledek. Stejná logika je na **klientu** (`DataTable.jsx`, `lactateThresholdSegmented.js`) a na **serveru** (`server/utils/lactateThresholds.js`) pro reporty a e-maily.

---

## 1. Vstupní data

- **Body testu**: pro každý stupeň `power` (W nebo tempo v sekundách), `lactate` (mmol/L), volitelně `heartRate`.
- **Base lactate** (klidový laktát).
- **Sport**: `bike` (výkon ve W), `run` / `swim` (tempo v sekundách – vyšší = pomalejší).

Body se vždy **seřadí** podle intenzity: kolo nízký výkon → vysoký, běh/plavání pomalejší tempo → rychlejší.

---

## 2. Předzpracování křivky

- **Odstranění outlierů**: pokud laktát klesne o víc než 0,5 mmol/L při malé změně intenzity (&lt;10 %), bod se při D-maxu nepoužívá (podezření na chybu měření).
- **Monotónní tvar**: u D-maxu se pracuje s křivkou, kde laktát s rostoucí intenzitou neroste „zpátky“ (filtrují se výrazné propady).
- **Segmentovaná regrese** (pouze kolo, ≥5 bodů): navíc **isotonic regression** (Pool Adjacent Violators), aby laktát byl slabě monotónně rostoucí; volitelně **moving median** (okno 3).

---

## 3. Jak se určuje **LT2 (LTP2)** – anaerobní práh

LT2 odpovídá **nejprudšímu nárůstu laktátu** a typicky kolem **4 mmol/L** (OBLA).

### 3a) Kolo, ≥5 bodů – segmentovaná regrese (`lactateThresholdSegmented.js`)

- Model: **2 zlomy** – laktát jako funkce výkonu s dvěma breakpointy (LT1, LT2).
- **LT2** = druhý zlom (vyšší výkon).
- Dále se používají **D-max** (polynom 3. stupně + kolmá vzdálenost od úsečky první–poslední bod) a **OBLA 4.0** (výkon při 4 mmol/L, lineární interpolace).
- **Výsledné LT2** = průměr všech platných kandidátů (segmentovaný zlom, D-max, OBLA 4.0).

### 3b) Polynomický fit (DataTable)

- Proloží se **polynom** přes body (s ohledem na base lactate).
- **První derivace** = sklon křivky laktát vs. výkon/tempo.
- **LT2** = bod, kde je **první derivace maximální** (nejprudší nárůst laktátu).  
  U běhu/plavání (tempo) je derivace záporná, bere se tedy **minimum** (největší „záporný sklon“ = nejprudší nárůst při zrychlování).

### 3c) Fallback – D-max a heuristiky

- **D-max**: přímka mezi prvním a posledním bodem křivky; hledá se bod s **největší kolmou vzdáleností** od této přímky. Často se volá jen na **druhé polovině** křivky (vyšší intenzity).
- **Omezení pro LT2**:
  - Laktát v bodě LT2: **min. 3,5** (resp. 2× base), **max. 4,7 mmol/L**.
  - Ideál kolem **4,0 mmol/L**.
- Pokud D-max dá bod s laktátem &gt; 4,7, hledá se **nejbližší naměřený bod** s laktátem v rozsahu 3,5–4,7 (priorita bodu nejblíž 4,0).
- Alternativa: bod s **největším nárůstem laktátu** mezi sousedními stupni (IAT‑podobná metoda), pokud je jeho laktát v povoleném rozsahu.

**Shrnutí LT2**: hlavně „nejprudší nárůst“ (derivace / segmentovaný zlom) nebo D-max, vždy s kontrolou, že laktát je v rozmezí cca 3,5–4,7 mmol/L (ideál 4,0).

---

## 4. Jak se určuje **LT1 (LTP1)** – aerobní práh

LT1 je bod, kde laktát **začíná výrazněji stoupat** nad klidovou hodnotu, typicky **1,5–2,5 mmol/L**.

### 4a) Kolo, ≥5 bodů – segmentovaná regrese

- **LT1** = první zlom (nižší výkon).
- Další kandidát: **OBLA 2.0** – výkon při kterém křivka (po předzpracování) protne **2,0 mmol/L** (lineární interpolace).
- **Výsledné LT1** = průměr platných kandidátů (segmentovaný zlom, OBLA 2.0).
- Pokud by laktát v odhadnutém LT1 byl **&gt; 2,5 mmol/L**, použije se raději **OBLA 2.0** (LT1 se „stáhne“ na 2,0 mmol/L).

### 4b) Polynomický fit (DataTable)

- **LT1** = první bod (od nízké intenzity), kde křivka **začne růst** (derivace překročí malý práh).
- Důležité: pokud na začátku křivky laktát **nejdřív klesne** (lactate minimum), LT1 se hledá **až za tímto poklesem** (ne v „dolíku“).
- **Fyziologické meze**: laktát v LT1 musí být **≥ 1,5** a **≤ 2,5 mmol/L**. Pokud polynom dá hodnotu mimo, bere se místo toho výkon/tempo, kde křivka protne **1,5** nebo **2,5 mmol/L** (podle toho, jestli byl odhad pod nebo nad).

### 4c) Fallback – D-max a „první nárůst“

- **Pokles na začátku**: v první třetině křivky se najde **minimum laktátu**. Pokud je pokles o ≥ 0,2 mmol/L, pro LT1 se používají jen body **za tímto minimem** (aby LT1 nebyl v „dolíku“).
- **D-max na první polovině** křivky (po případném ořezu za poklesem) → kandidát na LT1.
- **LTP1 by měl mít** laktát zhruba **0,7× base až 2,5 mmol/L**. Pokud D-max na první polovině dá bod mimo, hledá se **první významný nárůst** (např. nárůst o &gt; 0,3 mmol/L oproti předchozímu bodu) v povoleném rozsahu.

**Serverová varianta** (`lactateThresholds.js`): LT1 = první bod (za laktátovým minimem), kde laktát ≥ 0,9× base a následující body „nestoupají zpět“; nebo druhý derivace &gt; malý práh; jinak první bod.

---

## 5. Validace a pořadí

- **LT1**: laktát **1,5–2,5 mmol/L** (příp. 0,7× base – 2,5).
- **LT2**: laktát **max. 4,7 mmol/L**, ideál kolem 4,0.
- **Pořadí**:
  - **Kolo**: LT1 (W) &lt; LT2 (W).
  - **Běh/plavání**: LT1 (tempo v s) &gt; LT2 (tempo) – tj. LT1 je pomalejší tempo než LT2.

Pokud by pořadí vyšlo obráceně (LT1 „výš“ než LT2), hodnoty se v kódu prohodí.

---

## 6. Další zobrazené metody (report / tabulka)

Kromě **LTP1** a **LTP2** se počítají:

- **D-max** – bod s max. kolmou vzdáleností od úsečky první–poslední (bez rozdělení na poloviny).
- **IAT** (Individual Anaerobic Threshold) – bod, kde je **nárůst laktátu na jednotku intenzity** (Δlaktát/Δvýkon) největší.
- **Log-log** – v log(power) vs. log(lactate) se hledá **zlom** (maximální změna sklonu).
- **OBLA 2.0, 2.5, 3.0, 3.5** – výkon/tempo při dané koncentraci laktátu (lineární interpolace mezi body).
- **Bsln + 0.5, + 1.0, + 1.5** – výkon při base lactate + 0.5 / 1.0 / 1.5 mmol/L.
- **LTRatio** – poměr LT2/LT1 (kolo) nebo LT1/LT2 (běh), pokud jsou oba prahy platné.

---

## 7. Kde to běží

| Místo | Soubor | Účel |
|------|--------|------|
| Klient – hlavní | `client/src/components/Testing-page/DataTable.jsx` | `findLactateThresholds`, `calculateDmax`, `calculateIAT`, polynom, validace |
| Klient – kolo ≥5 bodů | `client/src/components/Testing-page/lactateThresholdSegmented.js` | Segmentovaná regrese, isotonic, D-max, OBLA 2.0 / 4.0, ensemble |
| Server – reporty/e-maily | `server/utils/lactateThresholds.js` | Zjednodušená verze (D-max, heuristika LTP1 za minimem, LTP2 = D-max), OBLA, IAT, Log-log |

Pro **zobrazení v aplikaci** a **tréninkové zóny** se používají výsledky z klienta (DataTable + segmentovaná regrese). Pro **PDF/e-mail report** server přepočítá prahy vlastní funkcí, aby byl nezávislý na Reactu.
