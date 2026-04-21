# LaChart – App Store průvodce (iOS)

## Přehled

LaChart používá **Capacitor** – tvá React webová appka je zabalená do nativního iOS sheelu.
Vše co potřebuješ: Mac s Xcode + Apple Developer účet.

---

## 0. Předpoklady (jednou)

| Co | Kde získat | Cena |
|----|-----------|------|
| **Xcode 15+** | Mac App Store | Zdarma |
| **Apple Developer Program** | developer.apple.com/enroll | 99 USD/rok |
| **CocoaPods** | `sudo gem install cocoapods` | Zdarma |
| **Node.js 18+** | nodejs.org | Zdarma |

---

## 1. Build webové appky a sync do iOS

```bash
# v /client složce:

# Nastav produkční API URL
echo "REACT_APP_API_URL=https://tvůj-server.com" > .env.production

# Build + zkopíruj do iOS projektu
npm run cap:sync
```

Co se stane:
1. `npm run build` – vytvoří optimalizovaný React build do `/build`
2. `npx cap sync ios` – zkopíruje build + aktualizuje Capacitor pluginy v Xcode projektu
3. CocoaPods `pod install` proběhne automaticky

---

## 2. Otevři v Xcode

```bash
npm run cap:ios
# nebo ručně:
npx cap open ios
```

Xcode otevře `/ios/App/App.xcworkspace` (ne .xcodeproj!).

---

## 3. Nastav Bundle ID & Team v Xcode

1. V levém panelu klikni na **App** (modrá ikona projektu)
2. Záložka **Signing & Capabilities**
3. **Team** → vyber svůj Apple Developer účet
4. **Bundle Identifier** → `com.lachart.app` (nebo vlastní)
5. Zaškrtni **Automatically manage signing**

---

## 4. Přidej Push Notifications capability

V Xcode → **Signing & Capabilities** → klikni **+ Capability** → přidej:
- ✅ **Push Notifications**
- ✅ **Background Modes** → zaškrtni **Remote notifications**

> ⚠️ Bez toho push notifikace na real device nefungují.

---

## 5. App Icons (povinné pro App Store)

App Store vyžaduje ikonu **1024×1024 px** (PNG, bez průhlednosti).

### Rychlý způsob:
1. Připrav obrázek `AppIcon-1024.png` (1024×1024, PNG)
2. Jdi na **makeappicon.com** nebo **appicon.co**
3. Nahraj ikonu → stáhni ZIP se všemi velikostmi
4. V Xcode → `App/Assets.xcassets/AppIcon` → přetáhni sady ikon

### Nebo přes příkaz (pokud máš ImageMagick):
```bash
# Z /client složky:
for size in 20 29 40 58 60 76 80 87 120 152 167 180 1024; do
  convert public/icon/logo512.png -resize ${size}x${size} \
    ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-${size}.png
done
```

---

## 6. Testování na real device (bez App Store)

```bash
# Připoj iPhone kabelem
# V Xcode nahoře vlevo vyber svůj iPhone jako target
# Klikni ▶ Run
```

První spuštění:
- iPhone: Nastavení → Obecné → Správa zařízení → důvěřuj svému účtu

---

## 7. Push notifikace – APNs nastavení

Push notifikace vyžadují certifikát od Apple. Musíš to udělat jednou:

### 7a. Vytvoř App ID na Apple Developer portálu
1. developer.apple.com → Certificates, IDs & Profiles
2. **Identifiers** → **+** → App ID
3. Bundle ID: `com.lachart.app`
4. Zaškrtni **Push Notifications** → Continue → Register

### 7b. Vytvoř APNs klíč (doporučeno – platí pro všechny appky)
1. **Keys** → **+** → zadej název "LaChart Push Key"
2. Zaškrtni **Apple Push Notifications service (APNs)**
3. **Continue** → **Register** → **Download** (stáhni `.p8` soubor!)
4. Poznamenej si **Key ID** a **Team ID** (najdeš v Account → Membership)

### 7c. Nastav backend (Node.js)
Pokud chceš posílat push notifikace ze serveru, použij knihovnu `apn`:

```bash
# v server složce:
npm install apn
```

```javascript
// server/services/pushNotifications.js
const apn = require('apn');

const provider = new apn.Provider({
  token: {
    key:   './AuthKey_KEYID.p8',   // cesta k stáženému .p8 souboru
    keyId: 'TVŮJ_KEY_ID',
    teamId: 'TVŮJ_TEAM_ID',
  },
  production: process.env.NODE_ENV === 'production',
});

async function sendPush(deviceToken, title, body, data = {}) {
  const note = new apn.Notification({
    alert:   { title, body },
    payload: data,
    topic:   'com.lachart.app',    // Bundle ID
    sound:   'default',
  });
  const result = await provider.send(note, deviceToken);
  console.log('Push result:', result);
  return result;
}

module.exports = { sendPush };
```

---

## 8. Jak použít notifikace v React appce

### Automatická inicializace (přidej do App.jsx)

```jsx
import { usePushNotifications } from './hooks/usePushNotifications';

function App() {
  const { granted, token, request } = usePushNotifications({
    onMessage: (notification) => {
      console.log('Notification received:', notification);
    },
    onActionPerformed: (action) => {
      // Uživatel kliknul na notifikaci
      const type = action.notification.data?.type;
      if (type === 'interval_start') {
        // naviguj na testing page
      }
    },
  });

  // Vyžádej povolení po prvním přihlášení
  useEffect(() => {
    if (!granted) request();
  }, []);

  // Ulož token na server
  useEffect(() => {
    if (token) {
      api.saveDeviceToken(token); // tvoje API
    }
  }, [token]);
  
  // ...
}
```

### Lokální notifikace (bez serveru) – v LactateTestingPage

```javascript
import {
  scheduleIntervalStartNotification,
  scheduleLactateMeasurementNotification,
} from './services/pushNotifications';

// Když interval skončí a začne recovery:
await scheduleLactateMeasurementNotification();

// 5s před koncem recovery:
await scheduleIntervalStartNotification(protocol.recoveryDuration, nextStepPower);
```

---

## 9. Archivace a nahrání na App Store

### 9a. Nastav verzi v Xcode
- General → Version: `1.0.0`
- General → Build: `1`

### 9b. Vytvoř Archive
1. Xcode → **Product** → **Archive**
2. Počkej (2–5 minut)
3. Otevře se **Organizer** okno

### 9c. Nahraj na App Store Connect
1. V Organizer klikni **Distribute App**
2. Vyber **App Store Connect** → **Next**
3. **Upload** → zaškrtni všechny možnosti → **Next**
4. Automatické podepisování → **Next** → **Upload**
5. Počkej ~30 minut než Apple zpracuje build

---

## 10. App Store Connect – příprava stránky

Jdi na **appstoreconnect.apple.com**:

1. **My Apps** → **+** → **New App**
   - Platform: iOS
   - Name: LaChart
   - Bundle ID: com.lachart.app
   - SKU: lachart-app-1

2. **App Information**
   - Category: Sports / Health & Fitness
   - Privacy Policy URL: povinná!

3. **Pricing**: Free nebo Paid

4. **Screenshots** (povinné):
   - iPhone 6.5" (1284×2778): min 3 screenshoty
   - iPhone 5.5" (1242×2208): min 3 screenshoty
   - Screenshoty udělej přes iPhone Simulator v Xcode

5. **Description** (text popisu appky v App Store)

6. **Keywords** (max 100 znaků): `lactate,threshold,cycling,testing,training,zones`

7. Vyber nahraný build → **Save** → **Submit for Review**

---

## 11. TestFlight (testování před vydáním)

Doporučuji nejdřív otestovat přes TestFlight:

1. App Store Connect → tvoje appka → **TestFlight**
2. Vyber build → přidej **Internal Testers** (tvůj Apple ID)
3. Na iPhone stáhni app **TestFlight** z App Store
4. Dostaneš email s pozvánkou → install

---

## 12. ⚠️ Důležité omezení na iOS

### Bluetooth (Web Bluetooth API)
Web Bluetooth **nefunguje** v iOS WKWebView (Apple ho blokuje).

**Co nefunguje na iOS:**
- Připojení trenažeru přes Bluetooth v LactateTesting stránce
- Připojení HR monitoru přes Bluetooth

**Co funguje:**
- Všechny ostatní funkce (testy, grafy, zóny, analýzy)
- Push notifikace ✅
- Lokální notifikace ✅

**Řešení pro Bluetooth na iOS:**
Pokud chceš Bluetooth na iOS, potřebuješ nativní Capacitor plugin:
```bash
npm install capacitor-bluetooth-le
# nebo
npm install @capacitor-community/bluetooth-le
```
Pak přepsat deviceConnectivity.js aby používal tento plugin místo Web Bluetooth API.

### Android
Na Androidu Web Bluetooth funguje bez problémů → trenažer + HR monitor se normálně připojí.

---

## 13. Checklist před submission

- [ ] App icons nastaveny (všechny velikosti)
- [ ] Splash screen funguje
- [ ] `.env.production` má správnou API URL
- [ ] Privacy Policy URL funguje
- [ ] Screenshoty nahrány (iPhone 6.5" + 5.5")
- [ ] Popis appky napsán anglicky + česky
- [ ] Verze/Build číslo nastaveno
- [ ] Push Notifications capability přidána v Xcode
- [ ] Testováno na real device přes TestFlight

---

## Rychlý přehled příkazů

```bash
# V /client složce:

# 1. Build + sync
npm run cap:sync

# 2. Otevři v Xcode
npm run cap:ios

# 3. Sync bez rebuildu (po změně pouze v JS)
npm run cap:sync:no-build
```

---

## Timelina do App Store

| Krok | Čas |
|------|-----|
| Registrace Apple Developer | 1–2 dny (schválení) |
| Příprava + build | 1–2 hodiny |
| TestFlight testování | 24 hodin (Apple review) |
| App Store review | 1–3 dny (první), ~24h poté |

Celkem: **3–7 dní** od první přihlášky do Apple Developer programu.
