# Vysvětlení výpočtů v LaChart

Tento dokument vysvětluje, jak se počítají všechny metriky v aplikaci LaChart.

## 📊 Měsíční analýza tréninků (`analyzeTrainingsByMonth`)

### 1. **Základní statistiky**

#### Počet tréninků
- **Bike tréninky**: Počítají se všechny tréninky se sportem `cycling` nebo tréninky, které nejsou `running` ani `swimming`
- **Running tréninky**: Počítají se všechny tréninky se sportem `running`
- **Swimming tréninky**: Počítají se všechny tréninky se sportem `swimming`
- **Celkový počet**: Součet všech tréninků v daném měsíci

#### Čas tréninků
- **Bike time**: Sčítá se čas z `records` pro cyklistické tréninky (v sekundách)
- **Running time**: Sčítá se čas z `records` pro běžecké tréninky
- **Swimming time**: Sčítá se čas z `records` pro plavecké tréninky
- **Total time**: `bikeTime + runningTime + swimmingTime`

### 2. **Výpočet průměrných hodnot**

#### Průměrný výkon (Bike)
```
bikeAvgPower = bikeTotalPowerSum / bikePowerCount
```
- `bikeTotalPowerSum`: Součet všech hodnot výkonu vynásobených časovým přírůstkem
- `bikePowerCount`: Celkový čas (v sekundách), po který byl měřen výkon
- **Vážený průměr**: Každá hodnota výkonu je vážena časem, po který platila

#### Maximální výkon
```
bikeMaxPower = MAX(všechny hodnoty výkonu v měsíci)
```

#### Průměrný pace (Running)
```
runningAvgPace = runningTotalPaceSum / runningPaceCount
```
- `runningTotalPaceSum`: Součet všech hodnot pace (v sekundách/km) vynásobených časem
- `runningPaceCount`: Celkový čas měření pace
- **Pace se počítá**: `paceSeconds = 1000 / speed` (kde speed je v m/s)

#### Nejlepší pace (Running)
```
runningMaxPace = MIN(všechny hodnoty pace)
```
- **Poznámka**: Nižší pace = rychlejší (méně sekund na km)

#### Průměrná tepová frekvence
```
avgHeartRate = totalHeartRateSum / heartRateCount
```
- Vážený průměr podle času měření

### 3. **Výpočet zón**

#### Power zóny (Bike)
Zóny se určují podle profilu uživatele (z laktátového testu) nebo podle odhadu FTP:

**Pokud má uživatel zóny z laktátového testu:**
- Použijí se zóny z `user.powerZones.cycling`
- Zóny jsou: Zone 1 (Recovery), Zone 2 (Aerobic), Zone 3 (Tempo), Zone 4 (Threshold), Zone 5 (VO2max)

**Pokud nemá zóny z testu (fallback):**
- Odhad FTP: `FTP = maxPower * 0.75`
- Zone 1: 0 - 55% FTP
- Zone 2: 55% - 75% FTP
- Zone 3: 75% - 90% FTP
- Zone 4: 90% - 105% FTP
- Zone 5: 105%+ FTP

**Přiřazení zóny k hodnotě výkonu:**
- Pro každý `record` s výkonem se určí zóna podle rozsahu
- Čas strávený v zóně se sčítá: `zones[zone].time += timeIncrement`
- Průměrný výkon v zóně: `zones[zone].avgPower += power * timeIncrement`
- Počet měření: `zones[zone].powerCount += timeIncrement`

**Finální výpočty pro zóny:**
```
zones[zone].avgPower = zones[zone].avgPower / zones[zone].powerCount
zones[zone].percentage = (zones[zone].time / totalTime) * 100
```

#### Heart Rate zóny
HR zóny se počítají podle maximální tepové frekvence:

**Vzorec pro HR zóny:**
- Zone 1: 50-60% maxHR
- Zone 2: 60-70% maxHR
- Zone 3: 70-80% maxHR
- Zone 4: 80-90% maxHR
- Zone 5: 90-100% maxHR

**Separátní zóny pro Bike a Run:**
- `bikeHrZones`: Používá `maxHeartRate` z cyklistických tréninků
- `runningHrZones`: Používá `runningMaxHeartRate` z běžeckých tréninků

**Výpočet času v HR zónách:**
- Pro každý `record` s HR se určí zóna
- Čas se přidá do příslušné zóny: `hrZones[zone].time += timeIncrement`
- Průměrná HR v zóně: `hrZones[zone].avgHeartRate += hr * timeIncrement`

#### Running Pace zóny
**Pokud má uživatel zóny z laktátového testu:**
- Použijí se zóny z `user.powerZones.running`
- Zóny jsou v sekundách na km

**Pokud nemá zóny (fallback):**
- Použije se průměrný pace měsíce jako referenční hodnota
- Zone 1: >120% avgPace (nejpomalejší)
- Zone 2: 105-120% avgPace
- Zone 3: 95-105% avgPace
- Zone 4: 85-95% avgPace
- Zone 5: <85% avgPace (nejrychlejší)

**Poznámka**: Pro běh platí, že nižší pace (méně sekund) = rychlejší

#### Swimming Pace zóny
- Pouze pokud má uživatel zóny z profilu (`user.powerZones.swimming`)
- Pace se počítá jako sekundy na 100m: `paceSeconds = 100 / speed`

### 4. **Výpočet TSS (Training Stress Score)**

TSS se počítá **stejně** pro všechny komponenty aplikace (`CalendarView.jsx`, `FormFitnessChart.jsx`, `WeeklyTrainingLoad.jsx`, `fitnessMetricsController.js`).

#### Obecný princip
- **TSS = 100** znamená 1 hodinu tréninku na FTP/threshold pace
- Pokud má aktivita uložené `trainingStressScore`, použije se to
- Pokud ne, vypočítá se z `avgPower`/`avgSpeed` a zón z profilu

#### Bike TSS
```
bikeTSS = (seconds * NP²) / (FTP² * 3600) * 100
```
- `seconds`: Délka tréninku v sekundách (`totalElapsedTime` nebo `movingTime`)
- `NP` (Normalized Power): Používá se `avgPower` jako aproximace
- `FTP`: Z profilu v tomto pořadí:
  1. `user.powerZones.cycling.lt2` (z laktátového testu)
  2. `user.powerZones.cycling.zone5.min` (fallback)
  3. `user.ftp` (fallback)
  4. `250W` (výchozí odhad)
- **Význam**: TSS = 100 znamená 1 hodinu tréninku na FTP

#### Running TSS
```
runningTSS = (seconds * (referencePace / avgPace)²) / 3600 * 100
```
- `seconds`: Délka tréninku v sekundách
- `avgPace`: Průměrný pace tréninku (v sekundách/km) = `1000 / avgSpeed` (kde `avgSpeed` je v m/s)
- `referencePace`: Threshold pace z profilu v tomto pořadí:
  1. `user.powerZones.running.lt2` (z laktátového testu)
  2. `user.runningZones.lt2` (fallback)
  3. `avgPace` (pokud není threshold pace, použije se avgPace → intensity = 1.0)
- **Intensity Ratio**: `referencePace / avgPace`
  - Rychlejší pace (nižší sekundy) = vyšší intensity ratio = vyšší TSS
- **Význam**: Rychlejší pace než reference = vyšší TSS

#### Swimming TSS
```
swimmingTSS = (seconds * (referencePace / avgPace)²) / 3600 * 100
```
- `seconds`: Délka tréninku v sekundách
- `avgPace`: Průměrný pace tréninku (v sekundách/100m) = `100 / avgSpeed` (kde `avgSpeed` je v m/s)
- `referencePace`: Threshold pace z profilu:
  1. `user.powerZones.swimming.lt2` (z laktátového testu)
  2. `avgPace` (pokud není threshold pace, použije se avgPace → intensity = 1.0)
- **Intensity Ratio**: `referencePace / avgPace`
  - Rychlejší pace (nižší sekundy) = vyšší intensity ratio = vyšší TSS

#### Total TSS
```
totalTSS = bikeTSS + runningTSS + swimmingTSS
```

#### Použití v různých komponentách

**FitTraining (FIT soubory):**
- Pokud má `trainingStressScore` → použije se
- Pokud ne → vypočítá se z `avgPower`/`avgSpeed` a zón z profilu

**StravaActivity:**
- Vždy se počítá z `averagePower`/`averageSpeed` a zón z profilu
- Používá `movingTime` jako délku tréninku

**Training (manuální tréninky):**
- Nemá TSS, takže se nepoužívá pro výpočet Fitness/Fatigue

### 5. **Predikce laktátu**

Pro každou hodnotu výkonu se predikuje laktát pomocí funkce `predictLactate(power)`:
- Používá se model založený na laktátových testech uživatele
- Predikovaný laktát se váží časem: `zones[zone].predictedLactate += predictedLactate * timeIncrement`
- Finální průměr: `zones[zone].predictedLactate = zones[zone].predictedLactate / zones[zone].time`

---

## 📈 Fitness, Fatigue, Form (`calculateFormFitnessData`)

### Výpočet pomocí klouzavých průměrů

**Klíčový princip**: Fitness a Fatigue se počítají jako **klouzavé průměry** denní zátěže (TSS) za určité období.

### Inicializace
- **Fitness window**: 42 dní (~6 týdnů)
- **Fatigue window**: 7 dní (1 týden)
- **Výpočet začíná**: Od nejstaršího tréninku v databázi (ne od `days` zpět)
- **Zobrazení**: Pouze dny v rozsahu `days` (např. posledních 60 dní)

### Zdroje dat
- **FitTraining**: Používá `trainingStressScore` (pokud je) nebo počítá z `avgPower`/`avgSpeed` a zón z profilu
- **StravaActivity**: Počítá z `averagePower`/`averageSpeed` a zón z profilu
- **Training**: Nemá TSS, takže se nepoužívá

### Denní výpočet (pro každý den od nejstaršího tréninku)
```
1. Najít všechny aktivity daného dne
2. Pro každou aktivitu:
   - Pokud má uložené TSS → použít
   - Pokud ne → vypočítat z avgPower/avgSpeed a zón z profilu
3. dailyTSS = součet TSS všech aktivit daného dne
   // Dny bez tréninku mají dailyTSS = 0

4. Fitness (klouzavý průměr za 42 dní):
   fitness = průměr(dailyTSS za posledních 42 dní)
   // Včetně dní s 0 TSS (rest days)
   // Dlouhodobá kondice - jak jsi trénovaný za poslední týdny

5. Fatigue (klouzavý průměr za 7 dní):
   fatigue = průměr(dailyTSS za posledních 7 dní)
   // Včetně dní s 0 TSS (rest days)
   // Krátkodobá únava - jak moc jsi "rozbitý" z posledních tréninků

6. Form:
   form = fitness - fatigue
   // Aktuální připravenost k výkonu
```

### Filtrování podle sportu
- Pokud je `sportFilter` nastaven (bike/run/swim/all), počítají se pouze aktivity daného sportu
- TSS se počítá pouze z aktivit, které odpovídají filtru

### Interpretace hodnot Form
| Form | Co to znamená |
|------|---------------|
| +20 až +40 | Špičková forma (závod) |
| +5 až +15 | Svěží, dobré tréninky |
| 0 až −10 | Normální stav |
| −10 až −30 | Tvrdý trénink |
| < −30 | Riziko přetížení |

### Zobrazení dat
- Do výsledku se přidají pouze dny v rozsahu `days` (např. posledních 60 dní)
- Výpočet ale probíhá od nejstaršího tréninku, aby byly hodnoty správně vypočítané

### Význam hodnot
- **Fitness**: Dlouhodobá kondice - objem + konzistence tréninku za posledních 42 dní
  - 📈 roste → systematicky trénuješ
  - 📉 klesá → pauza, taper, nemoc
  - Vysoké Fitness = velká vytrvalostní kapacita
  
- **Fatigue**: Krátkodobá únava - zátěž z posledních 7 dní
  - 📈 rychle roste po těžkých týdnech
  - 📉 rychle klesá po odpočinku
  - Reaguje mnohem rychleji než Fitness
  
- **Form**: Okamžitá připravenost (Fitness - Fatigue)
  - Pozitivní Form = připraven k závodu
  - Negativní Form = přetrénovaný/unavený
  - Před závodem chceš pozitivní Form
  - V přípravě je Form často negativní

---

## 📅 Týdenní tréninková zátěž (`calculateWeeklyTrainingLoad`)

### Výpočet týdenního TSS
1. Všechny aktivity se seskupí podle týdne (pondělí-neděle)
2. Pro každou aktivitu:
   - Pokud má uložené TSS → použít
   - Pokud ne → vypočítat z `avgPower`/`avgSpeed` a zón z profilu
3. Pro každý týden: `weekTSS = součet TSS všech aktivit v týdnu`

### Filtrování podle sportu
- Pokud je `sportFilter` nastaven (bike/run/swim/all), počítají se pouze aktivity daného sportu
- TSS se počítá pouze z aktivit, které odpovídají filtru

### Optimální zátěž
```
averageTSS = průměr TSS z posledních 4 týdnů (kromě aktuálního)
optimalMin = averageTSS * 0.8
optimalMax = averageTSS * 1.2
```

### Zobrazení
- Zobrazují se pouze týdny v rozsahu `months` (např. posledních 3 měsíců)
- Pro každý týden se zobrazuje:
  - `trainingLoad`: Skutečný TSS týdne
  - `optimalLoad`: Optimální TSS (průměr z posledních 4 týdnů)

### Training Status
- **Overreaching**: `currentWeekTSS > optimalMax * 1.3` (přetrénování)
- **Productive**: `optimalMin <= currentWeekTSS <= optimalMax` (optimální)
- **Maintaining**: `optimalMin * 0.5 <= currentWeekTSS < optimalMin` (udržování)
- **Recovery**: `0 < currentWeekTSS < optimalMin * 0.5` (regenerace)
- **Detraining**: `currentWeekTSS === 0` (bez tréninku)

---

## 🎯 Dnešní metriky (`calculateTodayMetrics`)

### Výpočet pro dnešek
1. Najít všechny aktivity z dneška
2. Vypočítat:
   - `todayFitness`: Fitness z dnešního dne
   - `todayFatigue`: Fatigue z dnešního dne
   - `todayForm`: Form z dnešního dne

### Změna oproti včerejšku
```
fitnessChange = todayFitness - yesterdayFitness
fatigueChange = todayFatigue - yesterdayFatigue
formChange = todayForm - yesterdayForm
```

---

## 🔄 Aktualizace dat

### Automatická aktualizace v `LactateStatistics`
1. **Event listenery**: Poslouchají eventy `trainingAdded`, `trainingUpdated`, `stravaSyncComplete`
2. **Polling mechanismus**: Každých 30 sekund kontroluje, zda přibyly nové tréninky (pouze pokud je vybraný aktuální měsíc)
3. **Automatické obnovení**: Pokud se detekují nové tréninky, automaticky se:
   - Obnoví metadata měsíců (`loadAvailableMonths`)
   - Obnoví data aktuálního měsíce s `forceReload = true` (přepíše cache)

---

## 📝 Poznámky

### Cache
- Data se ukládají do `localStorage` s platností 1 hodinu
- Metadata měsíců: `monthlyAnalysis_metadata_{athleteId}`
- Data měsíce: `monthlyAnalysis_{athleteId}_{monthKey}`

### Time Increment
- Pro každý `record` se počítá časový přírůstek: `timeDiff = (currentTimestamp - previousTimestamp) / 1000`
- Pokud je `timeDiff` mezi 0-10 sekundami, použije se jako `timeIncrement`
- Jinak se použije `timeIncrement = 1` sekunda

### Vážené průměry
- Všechny průměry (power, pace, HR) jsou **vážené časem**
- Každá hodnota je vynásobena časem, po který platila
- Finální průměr = součet vážených hodnot / celkový čas

---

## 🧮 Příklad výpočtu

### Příklad: Průměrný výkon v měsíci
```
Record 1: power = 200W, time = 10s
Record 2: power = 250W, time = 20s
Record 3: power = 180W, time = 15s

bikeTotalPowerSum = (200 * 10) + (250 * 20) + (180 * 15) = 2000 + 5000 + 2700 = 9700
bikePowerCount = 10 + 20 + 15 = 45

bikeAvgPower = 9700 / 45 = 215.56W
```

### Příklad: Čas v zónách
```
Power zóny: Zone 4 = 200-250W
Record 1: 220W (10s) → Zone 4
Record 2: 180W (20s) → Zone 3
Record 3: 240W (15s) → Zone 4

zones[4].time = 10 + 15 = 25s
zones[3].time = 20s
totalTime = 45s

zones[4].percentage = (25 / 45) * 100 = 55.6%
zones[3].percentage = (20 / 45) * 100 = 44.4%
```

### Příklad: TSS výpočet

#### Bike TSS
```
Trénink: 3600s (1 hodina), avgPower = 200W, FTP = 250W

bikeTSS = (3600 * 200²) / (250² * 3600) * 100
        = (3600 * 40000) / (62500 * 3600) * 100
        = 144000000 / 225000000 * 100
        = 0.64 * 100
        = 64 TSS
```

#### Running TSS
```
Trénink: 3600s (1 hodina), avgSpeed = 3.33 m/s, thresholdPace = 240s/km

avgPace = 1000 / 3.33 = 300s/km
intensityRatio = 240 / 300 = 0.8

runningTSS = (3600 * 0.8²) / 3600 * 100
           = (3600 * 0.64) / 3600 * 100
           = 2304 / 3600 * 100
           = 0.64 * 100
           = 64 TSS
```

#### Swimming TSS
```
Trénink: 1800s (30 minut), avgSpeed = 1.2 m/s, thresholdPace = 90s/100m

avgPace = 100 / 1.2 = 83.33s/100m
intensityRatio = 90 / 83.33 = 1.08

swimmingTSS = (1800 * 1.08²) / 3600 * 100
            = (1800 * 1.1664) / 3600 * 100
            = 2099.52 / 3600 * 100
            = 0.583 * 100
            = 58 TSS
```

---

Tento dokument popisuje všechny hlavní výpočty v systému LaChart. Pokud máte dotazy k konkrétním výpočtům, napište mi!

