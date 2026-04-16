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

Notes:
- STRAVA_REDIRECT_URI must match exactly the Redirect URI configured in your Strava App settings.
- In production, set `STRAVA_REDIRECT_URI` to `https://your-domain/api/integrations/strava/callback`.
- **Garmin**: OAuth connect flow now expects `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_REDIRECT_URI`, and `GARMIN_TOKEN_URL`.
- Garmin activity ingestion may still require Garmin push API callbacks or additional OAuth activity endpoints depending on your approved Developer Program access.
- Never commit real secrets to git. Use deployment secrets/vars in your hosting platform.
