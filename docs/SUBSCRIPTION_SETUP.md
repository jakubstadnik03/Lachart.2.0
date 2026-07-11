# Subscription Setup Guide

Tento dokument popisuje, jak nastavit systém předplatného v LaChart aplikaci pomocí Stripe.

## ⚠️ DŮLEŽITÉ: Systém je připravený, ale zatím neaktivní

Subscription systém je připravený a funkční, ale **není aktivní**. Všechny routy fungují bez omezení. 

**Pro aktivaci:** Přidejte do `server/.env`:
```env
SUBSCRIPTION_ENABLED=true
```

Bez tohoto nastavení mají všichni uživatelé přístup ke všem funkcím (subscription checks jsou přeskočeny).

## 1. Instalace Stripe

```bash
cd server
npm install stripe
```

## 2. Nastavení Stripe účtu

1. Vytvořte účet na [Stripe.com](https://stripe.com)
2. Získejte API klíče z [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
3. Vytvořte produkty a ceny v Stripe Dashboard:
   - Athlete Plan: €6.99/month
   - Coach Plan: €14.99/month
   - Team Plan: $49.99/month
   - Enterprise Plan: $99.99/month

### Stripe product copy — Coach plan

**Product name:** `LaChart Coach`

**Short description** (Stripe product description field — zobrazí se v Checkoutu):

```
Full coaching platform for endurance sports coaches. Everything in LaChart Athlete, plus unlimited athletes, a coach dashboard, branded lactate PDF reports, and tools to plan and analyze training for your entire squad. Includes a 2-month free trial.
```

**Marketing features** (Stripe → Product → Pricing → Features — jedna položka na řádek):

```
Everything in Athlete (unlimited lactate tests, workout planner, training calendar, session analysis, Strava & Garmin sync, advanced analytics, population comparison, PDF export)
Unlimited athletes — onboard, invite and manage your full squad
Coach dashboard with performance overviews across all athletes
Create and run lactate step tests on behalf of your athletes
Branded PDF reports — your logo, studio name and contact details
Plan structured workouts directly into each athlete's calendar
Analyze athlete training — sessions, laps, lactate overlays and trends
LT1 / LT2 curves, training zones and historical test comparison per athlete
Form, fitness & fatigue (CTL / ATL / TSB) tracking for every athlete
Priority support
2-month free trial — cancel anytime before billing starts
```

**Long description** (volitelné — metadata, landing page, interní reference):

```
LaChart Coach is the complete platform for sports coaches who work with lactate testing and structured endurance training.

Everything in Athlete is included: unlimited lactate tests with LT1/LT2 curve and zone calculation, workout planner, training calendar, live workout mode, smart-trainer support, advanced analytics, population comparison, Strava & Garmin sync, FIT upload, Apple Health integration, and PDF export.

Built for coaches:
• Unlimited athletes — invite by email, manage your roster, switch between athletes in one tap
• Coach dashboard — squad-wide overview of tests, training load and performance trends
• Lactate testing for athletes — design step tests and log samples on behalf of each athlete
• Branded PDF reports — customise templates with your logo, colours and contact information
• Workout planning for athletes — schedule sessions into individual athlete calendars
• Training analysis — review completed workouts, lap splits, pace/HR/power and lactate data
• Historical comparison — track how LT1, LT2 and zones evolve across your squad over time

€14.99/month after a 60-day free trial. Cancel anytime.
```

> **Poznámka:** Bulk CSV export je součástí Team / Enterprise plánu, ne Coach — do Coach popisu ho nepřidávejte.

### Promo kód pro stávající uživatele — `3MONTHSOFF`

Používá se v paid-launch marketing e-mailu (jen pro uživatele, kteří se registrovali před spuštěním placených plánů).

V Stripe Dashboard → **Product catalog → Coupons**:

1. **Create coupon**
   - Name: `3 months free — early users`
   - ID / code: `3MONTHSOFF` (promotion code, který uživatel zadá v Checkoutu)
   - Type: **Percent off** 100 % **or** **Amount off** — nejjednodušší je **100 % off for 3 months** (duration: repeating, months: 3)
   - Applies to: Athlete + Coach price IDs (nebo celý produkt)
   - Redemption limits: volitelně omezit `Max redemptions` nebo `First time orders` dle potřeby

2. Checkout už má `allow_promotion_codes: true` — uživatel zadá kód na Stripe stránce po kliknutí na plán v **Settings → Subscription**.

3. Po změně textu e-mailu resetuj sent markery v Admin → Marketing → Paid launch, nebo pošli preview sobě.

## 3. Konfigurace environment proměnných

Přidejte do `server/.env`:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... # Test key, nebo sk_live_... pro produkci
STRIPE_WEBHOOK_SECRET=whsec_... # Získáte z Stripe Dashboard > Webhooks
STRIPE_PRICE_ID_PRO=price_... # Price ID z Stripe Dashboard
STRIPE_PRICE_ID_COACH=price_...
STRIPE_PRICE_ID_TEAM=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...

# Frontend URL (pro redirecty)
FRONTEND_URL=http://localhost:3000 # nebo https://your-domain.com
```

## 4. Nastavení Webhook endpointu

1. V Stripe Dashboard jděte na **Developers > Webhooks**
2. Klikněte **Add endpoint**
3. URL: `https://your-domain.com/api/subscription/webhook`
4. Vyberte tyto events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Zkopírujte **Signing secret** do `.env` jako `STRIPE_WEBHOOK_SECRET`

## 5. Použití v kódu

### Backend - Ochrana routy

```javascript
const { checkSubscription, checkSubscriptionLimit } = require('../middleware/checkSubscription');

// Ochrana feature
router.get('/advanced-analytics', verifyToken, checkSubscription('advanced_analytics'), handler);

// Ochrana limitu
router.post('/test', verifyToken, checkSubscriptionLimit('testsPerMonth'), handler);
```

### Frontend - Získání subscription

```javascript
import api from '../services/api';

// Získat aktuální subscription
const response = await api.get('/api/subscription/current');
const { subscription } = response.data;

// Zkontrolovat feature
if (subscription.planDetails.features.includes('advanced_analytics')) {
  // Zobrazit feature
}
```

## 6. Subscription plány a features

### Free Plan
- Basic testing
- Basic analytics
- Limit: 5 testů/měsíc

### Athlete Plan (€6.99/month)
- Vše z Free +
- Advanced analytics
- Population comparison
- PDF export
- Strava sync
- Neomezené testy

### Coach Plan (€14.99/month)
- Vše z Athlete +
- Coach dashboard
- Multiple athletes (10)
- Neomezené testy

### Team Plan ($49.99/month)
- Vše z Coach +
- Team branding
- CSV export
- Multiple athletes (25)

### Enterprise Plan ($99.99/month)
- Vše z Team +
- White label
- Priority support
- Custom onboarding
- Multiple athletes (60)

## 7. Frontend komponenty

Vytvořte komponenty pro:
- Zobrazení plánů (`SubscriptionPlans.jsx`)
- Checkout flow (`CheckoutPage.jsx`)
- Subscription management (`SubscriptionSettings.jsx`)

## 8. Testování

### Test Cards (Stripe Test Mode)
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### Test Webhook
Použijte Stripe CLI:
```bash
stripe listen --forward-to localhost:8000/api/subscription/webhook
```

## 9. Migrace existujících uživatelů

Vytvořte migrační script, který:
1. Vytvoří free subscription pro všechny existující uživatele
2. Propojí subscription s user account

```javascript
const User = require('./models/UserModel');
const Subscription = require('./models/SubscriptionModel');

async function migrateUsers() {
  const users = await User.find({ subscriptionId: null });
  for (const user of users) {
    const subscription = await Subscription.create({
      userId: user._id,
      plan: 'free',
      status: 'active'
    });
    user.subscriptionId = subscription._id;
    await user.save();
  }
}
```

## 10. Monitoring

Sledujte:
- Počet aktivních subscriptions
- Churn rate
- Revenue metrics
- Failed payments

## Troubleshooting

### Webhook nefunguje
- Zkontrolujte `STRIPE_WEBHOOK_SECRET`
- Ověřte, že endpoint je přístupný z internetu
- Zkontrolujte logs v Stripe Dashboard

### Subscription se neaktualizuje
- Zkontrolujte webhook events v Stripe Dashboard
- Ověřte, že `handleWebhook` správně zpracovává events

### Payment failed
- Zkontrolujte Stripe logs
- Ověřte, že customer má platnou payment method
