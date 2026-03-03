# Subscription System Status

## ✅ Systém je připravený, ale zatím neaktivní

Subscription systém je kompletně připravený a funkční, ale **není aktivní**. 

### Co to znamená:

- ✅ Všechny modely, routes a middleware jsou vytvořené
- ✅ Stripe integrace je připravená
- ✅ Subscription checks jsou implementované
- ⚠️ **ALE:** Všechny routy fungují bez omezení (jako by všichni měli Pro plan)
- ⚠️ **Subscription middleware přeskočí kontroly** (neblokuje přístup)

### Aktuální stav:

- **Middleware `checkSubscription()`**: Přeskočí kontrolu → všichni mají přístup
- **Middleware `checkSubscriptionLimit()`**: Přeskočí limity → neomezené použití
- **API `/api/subscription/current`**: Funguje (zobrazí free plan)
- **API `/api/subscription/plans`**: Funguje (zobrazí všechny plány)
- **API `/api/subscription/create-checkout-session`**: Vrátí chybu (systém neaktivní)
- **Webhook `/api/subscription/webhook`**: Ignoruje events (systém neaktivní)

### Pro aktivaci:

1. Přidejte do `server/.env`:
   ```env
   SUBSCRIPTION_ENABLED=true
   ```

2. Nastavte Stripe klíče (viz `SUBSCRIPTION_SETUP.md`)

3. Restartujte server

### Po aktivaci:

- Subscription middleware začne kontrolovat přístup
- Uživatelé bez aktivního subscription budou mít omezený přístup
- Limity budou vynucené
- Checkout a webhooky budou fungovat

### Pro testování bez aktivace:

- Všechny routy fungují normálně
- Můžete testovat UI komponenty
- Můžete zobrazovat plány v Settings
- Checkout nebude fungovat (vrátí chybu)
