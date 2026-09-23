# Coach promo campaign — "2 months free" (LaChart)

Goal: reach coaches (existing users first, then a cold list) with a code for **2 months free**, positioned alongside TrainingPeaks / whatever they run.

Code placeholder below is `{{CODE}}` — replace with the real Stripe promotion code (e.g. `COACH2FREE`) once created.

---

## 0. The promo code (Jakub creates in Stripe — payments are the owner's job)

1. Stripe Dashboard → **Coupons** → Create coupon: **100% off**, Duration **Repeating**, **Duration in months = 2**.
2. Create a **Promotion code** on that coupon, e.g. `COACH2FREE` (optionally limit max redemptions / expiry).
3. Nothing else to wire — checkout already sets `allow_promotion_codes: true`, so the code is entered in the promo field at Stripe checkout. Applies to whichever plan (coach €14.99 or athlete €6.99) the person picks.

> The coupon gives 2 months at 100% off *on top of* the standard trial, so effectively a long free runway. If you'd rather be more generous with zero work, the existing `3MONTHSOFF` (3 months) already exists — say the word and the copy switches to "3 months".

---

## Sending plan (safe, phased)

**Do NOT use `POST /api/subscription/send-promo-email`** as-is — it blasts *every* user, ignores marketing opt-out, has no pacing and no unsubscribe. That risks the lachart.net domain getting blocklisted (which kills transactional mail too).

- **Phase 1 — existing opted-in users (safe, first).** Send through the paced, opt-out-respecting, unsubscribe-enabled newsletter pipeline (`productUpdateCampaignService`) as a one-off promo issue. Low risk, highest conversion (they already know LaChart).
- **Phase 2 — cold list (306 coaches in `client/src/data/outreachContacts.js`), only after Phase 1 looks healthy.** Small daily batches (Zoho-safe, e.g. 20–30/day), warmed domain, one-click unsubscribe, clear sender. Never a single blast. GDPR: legitimate-interest B2B + easy opt-out; drop anyone who unsubscribes permanently.

---

## Email A — existing LaChart users (warm)

**Subject options**
- Your LaChart, 2 months on us 🎁
- A gift: 2 months of LaChart Pro, free
- 2 months free — thanks for being here

**Body**
> Hi {First},
>
> Quick thank-you for being part of LaChart. Here are **2 months free** to use the full platform — zones from a real lactate test, the calendar and workout builder, load & form, and branded PDF reports.
>
> **Your code: {{CODE}}** — enter it at checkout (Settings → Subscription). No charge for 2 months, cancel anytime.
>
> If you coach, this is the moment to bring your athletes on: connect them, set their zones from a test, and plan straight onto their calendar.
>
> [Redeem 2 months free →]  ·  [See what's included →]
>
> — Jakub, founder · LaChart
>
> *One-click unsubscribe below.*

---

## Email B — cold coaches (TrainingPeaks angle)

**Subject options**
- Zones from a real test, not a % of a guess — 2 months free
- The lactate half of your coaching stack (2 months on us)
- For coaches who lactate-test: 2 months of LaChart free

**Body**
> Hi {First},
>
> You've already got the coaching stack — calendar, structured workouts, load & form. LaChart adds the one thing a %-of-FTP platform can't: **zones off a real lactate test** (LT1/LT2 by six methods), pushed into the calendar and onto your athletes' Garmin.
>
> It sits **alongside TrainingPeaks**, not instead of it — unlimited athletes, branded PDF reports, unmetered lactate testing.
>
> Here are **2 months free** to try it with a couple of athletes: code **{{CODE}}** at signup.
>
> [Start free →]  ·  [See how it works for coaches →](https://lachart.net/for-coaches)
>
> No pitch calls. Not for you? Ignore this — one-click unsubscribe below.
>
> — Jakub, founder · LaChart

**Links:** signup with plan, `/for-coaches`, `/trainingpeaks-alternative` (for the curious). All get UTM `utm_source=email&utm_medium=campaign&utm_campaign=coach-promo-2mo`.

---

## Next step

Create the Stripe code, tell me the exact string, and I'll: (1) wire Phase 1 as a paced promo send to opted-in users, (2) set up the cold list as small daily batches for Phase 2. I don't send anything myself — you trigger each send from admin.
