# Server Environment Setup

Create a `.env` file in `server/` with the following keys:

```
PORT=8000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/lachart

# Auth
JWT_SECRET=change_me_to_a_long_random_secret

# Strava OAuth
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=http://localhost:8000/api/integrations/strava/callback

# Garmin Integration
# OAuth redirect should point to your backend callback:
# https://your-backend/api/integrations/garmin/callback
# Token URL depends on Garmin Developer Program credentials/environment.
# Set GARMIN_TOKEN_URL from the Garmin portal/docs for your approved app.
GARMIN_CLIENT_ID=
GARMIN_CLIENT_SECRET=
GARMIN_REDIRECT_URI=http://localhost:8000/api/integrations/garmin/callback
GARMIN_TOKEN_URL=
# Optional overrides
# GARMIN_AUTHORIZE_URL=https://connect.garmin.com/oauth2Confirm
# GARMIN_API_BASE_URL=https://apis.garmin.com

# Subscription System (PREPARED BUT INACTIVE)
# Set SUBSCRIPTION_ENABLED=true to enable subscription checks
# When false, all users have access to all features
SUBSCRIPTION_ENABLED=false

# Stripe Configuration (only needed if SUBSCRIPTION_ENABLED=true)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRICE_ID_PRO=price_...
# STRIPE_PRICE_ID_COACH=price_...
# STRIPE_PRICE_ID_TEAM=price_...
# STRIPE_PRICE_ID_ENTERPRISE=price_...
# FRONTEND_URL=http://localhost:3000
```

## Garmin Training API (built, inactive until Garmin approves)

```
# Leave BOTH unset until Garmin grants Training API access on the LaChart key.
# GARMIN_TRAINING_API_ENABLED=true
# GARMIN_WORKOUT_SCOPE=WORKOUT_IMPORT
```

Pushes planned workouts into Garmin Connect and schedules them on the
athlete's calendar (`server/services/garminWorkoutPushService.js`). While
`GARMIN_TRAINING_API_ENABLED` is unset every entry point returns
`{ skipped: 'training_api_disabled' }` and the OAuth flow requests **no**
scope — asking for a scope the key does not hold can make Garmin reject the
whole authorization and break the read-only activity sync that works today.

Activation, once approved:
1. Set both variables (use whatever scope string Garmin issues — the
   `WORKOUT_IMPORT` above is the expected name, not a confirmed one).
2. Have users reconnect Garmin once so the new scope is granted.
3. Verify the payload field names against Garmin's partner spec — the
   serializer in `garminTrainingApiClient.js` is reconstructed from public
   sources, and the schema maps at the top of that file are the only place
   that needs changing.

## Credential encryption (required for intervals.icu)

```
# 32-byte key, as 64 hex chars. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SECRET_BOX_KEY=
```

Used by `server/utils/secretBox.js` (AES-256-GCM) to encrypt third-party API
keys at rest — currently the athlete's intervals.icu key, which grants
calendar-write access to their account.

Without it the intervals.icu "Connect" endpoint returns 503 and refuses to
store the key rather than saving it in plaintext. Everything else keeps
working. **Rotating this key makes every stored key undecryptable** — affected
athletes simply reconnect.

Notes:
- STRAVA_REDIRECT_URI must match exactly the Redirect URI configured in your Strava App settings.
- In production, set `STRAVA_REDIRECT_URI` to `https://your-domain/api/integrations/strava/callback`.
- **Garmin**: OAuth connect flow now expects `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_REDIRECT_URI`, and `GARMIN_TOKEN_URL`.
- Garmin activity ingestion may still require Garmin push API callbacks or additional OAuth activity endpoints depending on your approved Developer Program access.
- Never commit real secrets to git. Use deployment secrets/vars in your hosting platform.
