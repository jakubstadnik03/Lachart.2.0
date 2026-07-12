# Napojení Google Analytics 4 (varianta 3 — Service account + Data API)

Cíl: dát Claudovi read-only přístup k datům z GA4, aby z nich mohl dělat marketingové rozbory a reporty. Klíč zůstává jen u tebe na disku, nikdy se necommituje do gitu.

**Odhad času: ~15 minut.** Děláš to jen jednou.

---

## Krok 1 — Property ID ✅ HOTOVO

LaChart Property ID = **`509206827`**. Je už předvyplněné ve skriptu, nemusíš nic dělat.

(Kdyby ses k němu potřeboval dostat znovu: české rozhraní **Správce → sloupec Služba → Nastavení služby → ID služby**. Není to `G-HNHPQH30BL` = ID měření.)

---

## Krok 2 — Vytvoř projekt a service account v Google Cloud

1. Otevři [console.cloud.google.com](https://console.cloud.google.com)
2. Nahoře vyber projekt, nebo vytvoř nový (**New Project**, pojmenuj třeba `lachart-analytics`)
3. V horním vyhledávání najdi a otevři **Google Analytics Data API** → klikni **Enable**
   (přímý odkaz: [console.cloud.google.com/apis/library/analyticsdata.googleapis.com](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com))
4. Vlevo v menu **APIs & Services → Credentials**
5. Nahoře **+ CREATE CREDENTIALS → Service account**
6. Jméno: `lachart-ga-reader`, klikni **Create and continue**
7. Roli přeskoč (klikni **Continue** a pak **Done**) — přístup dáš přímo v GA, ne tady

---

## Krok 3 — Stáhni JSON klíč

1. V **Credentials** klikni na právě vytvořený service account (`lachart-ga-reader@...`)
2. Záložka **Keys → Add key → Create new key**
3. Vyber **JSON** → **Create** — stáhne se `.json` soubor
4. Přejmenuj ho na `ga4-service-account.json`
5. Přesuň ho sem:
   ```
   scripts/analytics/secrets/ga4-service-account.json
   ```
   > Tato složka je v `.gitignore` — klíč se do gitu nikdy nedostane. Nikde ho nesdílej ani neposílej do chatu.

---

## Krok 4 — Dej service accountu přístup k GA4 (jen pro čtení)

1. Otevři soubor `ga4-service-account.json` a najdi hodnotu `"client_email"` — vypadá jako
   `lachart-ga-reader@lachart-analytics.iam.gserviceaccount.com`. Zkopíruj ji.
2. Zpátky v [GA4 → Správce](https://analytics.google.com) → ve sloupci **Služba** klikni **Správa přístupu ke službě** (angl. *Property Access Management*)
3. Vpravo nahoře **+** → **Přidat uživatele** (*Add users*)
4. Vlož ten `client_email`
5. Role: **Čtenář** (*Viewer* — stačí čtení), odškrtni „Upozornit e-mailem"
6. **Přidat** (*Add*)

---

## Krok 5 — Nainstaluj a spusť

V terminálu:

```bash
cd scripts/analytics
npm install
GA4_PROPERTY_ID=123456789 node ga4-report.mjs
```

(za `123456789` dej svoje Property ID z kroku 1)

Volitelně jiný rozsah dní:
```bash
GA4_PROPERTY_ID=123456789 node ga4-report.mjs --days 90
```

Skript vypíše přehled, zdroje návštěvnosti, top stránky, vstupní stránky, země, zařízení a události.

---

## Krok 6 — Pošli mi výstup

Zkopíruj celý výstup z terminálu a vlož mi ho do chatu. Z toho udělám:
- odkud reálně chodí návštěvníci a co konvertuje,
- které z 9 bezplatných kalkulaček táhnou a které ztrácí lidi,
- kde je díra ve funnelu (návštěva → registrace → premium),
- konkrétní další kroky na marketing.

Až budeš chtít, můžu skript rozšířit (denní trendy, konkrétní konverzní cesty, porovnání období) nebo z něj udělat pravidelný týdenní report.

---

## Časté chyby

| Chyba ve výstupu | Řešení |
|---|---|
| `PERMISSION_DENIED` | Nepřidal jsi `client_email` jako Viewer v GA4 (krok 4), nebo špatné Property ID |
| `has not been used` / `SERVICE_DISABLED` | Nezapnul jsi Google Analytics Data API (krok 2.3) |
| `Chybí GA4_PROPERTY_ID` | Zapomněl jsi `GA4_PROPERTY_ID=...` před příkazem |
| `Chybí klíč` | JSON není ve `scripts/analytics/secrets/ga4-service-account.json` |

---

## Bezpečnost

- Klíč je **read-only** přístup jen k GA datům — nedává přístup k ničemu jinému v Google účtu.
- Kdykoli ho můžeš zneplatnit: Google Cloud Console → Credentials → service account → Keys → smazat.
- Nebo úplně odebrat přístup: GA4 → Property Access Management → odebrat uživatele.
