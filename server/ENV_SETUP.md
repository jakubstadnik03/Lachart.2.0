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
# Note: Garmin has an official Activity API (https://developer.garmin.com/gc-developer-program/activity-api/)
# but it requires approval as a business developer
# For regular developers, we use the garmin-connect npm library
# Users connect their Garmin accounts using their Garmin Connect username/password
# No API keys or OAuth setup required - credentials are stored encrypted
# 
# To use official Garmin API:
# 1. Apply for Garmin Connect Developer Program at https://developer.garmin.com/gc-developer-program/
# 2. Get approved as a business developer
# 3. Configure OAuth credentials (similar to Strava)
# 4. Update integration to use official API endpoints
```

Notes:
- STRAVA_REDIRECT_URI must match exactly the Redirect URI configured in your Strava App settings.
- In production, set `STRAVA_REDIRECT_URI` to `https://your-domain/api/integrations/strava/callback`.
- **Garmin**: No API keys or OAuth setup required. Users connect directly with their Garmin Connect credentials.
- Never commit real secrets to git. Use deployment secrets/vars in your hosting platform.
