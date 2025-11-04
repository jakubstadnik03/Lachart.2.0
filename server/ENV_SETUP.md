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
```

Notes:
- STRAVA_REDIRECT_URI must match exactly the Redirect URI configured in your Strava App settings.
- In production, set `STRAVA_REDIRECT_URI` to `https://your-domain/api/integrations/strava/callback`.
- Never commit real secrets to git. Use deployment secrets/vars in your hosting platform.
