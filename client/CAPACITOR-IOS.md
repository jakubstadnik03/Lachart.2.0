# Lachart – build pro App Store (iOS)

Aplikace je připravená jako **Capacitor** projekt. Webová aplikace (React) běží uvnitř nativní iOS „slupky“ a může být publikovaná na App Store.

## Co je hotové

- Přidané balíčky: `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`
- Konfigurace: `capacitor.config.json` (appId: `com.lachart.app`, appName: Lachart)
- Složka **ios/** s nativním Xcode projektem
- Build webu jde do složky **build/** a při `cap sync` se zkopíruje do iOS projektu

## Požadavky na Macu

1. **Xcode** z App Store (nejlépe nejnovější).
2. **CocoaPods**: `sudo gem install cocoapods` (nebo `brew install cocoapods`).
3. **Aktivní vývojářský adresář musí být Xcode** (ne jen Command Line Tools).

### Chyba: „xcodebuild requires Xcode, but active developer directory is Command Line Tools“

Pokud uvidíš tuto chybu při `npm run cap:sync`, v terminálu spusť:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

(Zadej heslo k Macu.) Pak znovu:

```bash
cd client && npm run cap:sync
```

Alternativa: **Xcode → Settings → Locations** a u **Command Line Tools** zvol **Xcode** (ne „Command Line Tools“).

## Příkazy

```bash
cd client

# 1. Sestavit web a zkopírovat do iOS projektu
npm run cap:sync

# 2. Otevřít projekt v Xcode
npm run cap:ios
```

V Xcode pak:

- Zvolit **Team** (Apple ID) v Signing & Capabilities.
- Připojit zařízení nebo zvolit simulátor a spustit (Run).
- Pro **App Store**: Product → Archive, pak Distribute App → App Store Connect.

## Po úpravách webu

Před každým testem nebo archivem znovu spusť:

```bash
npm run cap:sync
```

Případně jen zkopírovat bez nového buildu (pokud jsi už build měl):

```bash
npm run cap:sync:no-build
```

## Poznámky

- **Bundle ID** je `com.lachart.app`. Změna v `capacitor.config.json` (appId) se při dalším `cap sync` promítne do iOS projektu; v Xcode pak zkontroluj Signing.
- **API**: aplikace používá `REACT_APP_API_URL` z `.env` (např. `https://lachart.onrender.com`). V produkčním buildu tedy backend volá tvůj živý server.
- **App Store**: k odeslání do App Store potřebuješ Apple Developer účet (99 USD/rok) a v App Store Connect vytvořenou aplikaci.
