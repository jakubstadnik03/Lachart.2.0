const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 8000;

// Heap headroom check. The process died with "Reached heap limit" while the
// Render instance was only ~20% used: --max-old-space-size was 400MB against
// 2GB of available RAM, so Node refused memory the box was happy to give.
// Log the actual ceiling at boot — next time the number is in the log rather
// than being inferred from a crash.
try {
  const heapCapMb = Math.round(require('v8').getHeapStatistics().heap_size_limit / 1048576);
  console.log(`[Config] Node heap limit: ${heapCapMb} MB`);
  if (heapCapMb < 900) {
    console.warn(`[Config] Heap limit is only ${heapCapMb} MB — raise --max-old-space-size in the start script if the host has more RAM.`);
  }
} catch { /* v8 stats unavailable — not worth failing boot over */ }

// Public web address used to build every link we email out — verification,
// password reset, receipts, weekly digests, campaigns, one-click sign-in.
//
// Hardcoded on purpose. Fifteen modules read process.env.CLIENT_URL at call
// time, and production was running with http://localhost:3000, so every link
// LaChart had ever emailed pointed at the recipient's own machine and did
// nothing — almost certainly why 551 of 650 accounts never verified their
// email. Emails only ever go to real people, so there is no situation where
// the correct target is anything other than the live site. Taking it out of
// configuration removes the whole class of mistake.
//
// Trade-off accepted: a link in a locally-sent test email opens production,
// not localhost.
const PUBLIC_CLIENT_URL = 'https://lachart.net';
if (process.env.CLIENT_URL && process.env.CLIENT_URL !== PUBLIC_CLIENT_URL) {
  console.warn(`[Config] Ignoring CLIENT_URL="${process.env.CLIENT_URL}" — emailed links always use ${PUBLIC_CLIENT_URL}.`);
}
process.env.CLIENT_URL = PUBLIC_CLIENT_URL;

// Render terminates TLS at its own proxy and forwards the caller in
// X-Forwarded-For. Without this, express-rate-limit sees every request as
// coming from the proxy: it logged ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every
// hit and keyed all users into a single bucket, so the login limiter could lock
// out the whole internet at once while doing nothing per-attacker. Trust one
// hop only — trusting blindly would let a client forge the header and dodge
// the limiter entirely.
app.set('trust proxy', 1);

// ✅ CORS configuration – allow local (both 3000 and 3001), Vercel preview, and production domain
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://lachart-bc.vercel.app',
  'https://lachart.net',
  'https://www.lachart.net',
  // Capacitor / Cordova WebView (iOS/Android) — without these, login/API fails with Axios ERR_NETWORK
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost'
];

// On Render: set ALLOW_LOCALHOST_ORIGIN=true to allow localhost (any port) for local dev against prod API
const allowLocalhostInProduction = process.env.ALLOW_LOCALHOST_ORIGIN === 'true';
const isLocalhostOrigin = (o) => o && (o.startsWith('http://localhost:') || o.startsWith('http://127.0.0.1:'));
/** Native app shells (Capacitor 3+ often capacitor://localhost; some builds use ionic:// or https://localhost) */
const isNativeAppShellOrigin = (o) => {
  if (!o || typeof o !== 'string') return false;
  return (
    o.startsWith('capacitor://') ||
    o.startsWith('ionic://') ||
    o === 'https://localhost' ||
    o === 'http://localhost'
  );
};

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    if (isNativeAppShellOrigin(origin)) {
      return callback(null, origin);
    }
    if (process.env.NODE_ENV !== 'production' && isLocalhostOrigin(origin)) {
      return callback(null, origin);
    }
    if (allowLocalhostInProduction && isLocalhostOrigin(origin)) {
      return callback(null, origin);
    }
    console.warn('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  optionsSuccessStatus: 204,
  preflightContinue: false
};

// CORS must be applied before other middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware
// Configure Helmet to not interfere with CORS (M5 — CSP enabled)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  // Restrictive CSP — allows Swagger UI CDN scripts and inline styles
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "cdn.jsdelivr.net", "'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https:"],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'", "data:"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// Ensure CORS headers are set correctly after Helmet (must mirror corsOptions logic)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = origin && (
    allowedOrigins.includes(origin) ||
    isNativeAppShellOrigin(origin) ||
    (process.env.NODE_ENV !== 'production' && isLocalhostOrigin(origin)) ||
    (allowLocalhostInProduction && isLocalhostOrigin(origin))
  );
  if (allowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  }
  next();
});

app.use(compression()); // Compress responses

// Stripe webhook must receive the raw body for signature verification.
// Mount BEFORE express.json() — the global JSON parser would otherwise
// consume the body and constructEvent() would fail in production.
const subscriptionController = require('./controllers/subscriptionController');
app.post(
  '/api/subscription/webhook',
  express.raw({ type: 'application/json' }),
  subscriptionController.handleWebhook
);

// Základní middleware
// Increase JSON body size limit to 50MB for large FIT file data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Debug logging (disable by default; it slows down every request a lot)
if (process.env.DEBUG_HTTP === '1') {
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});
}

// MongoDB Connection
// Prepare for Mongoose 7 default change (avoid strictQuery deprecation warning)
mongoose.set('strictQuery', false);
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    maxPoolSize: 10, // Maintain up to 10 socket connections
    minPoolSize: 2, // Maintain at least 2 socket connections
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Initialize cache
// Response-body cache. Two defaults here were expensive on a 400MB heap:
//   useClones (default true) deep-clones every value on BOTH set and get, so
//     each cached training payload was stored twice and copied again per hit;
//   no maxKeys meant one entry per distinct URL, unbounded — every athlete and
//     query-string combination held a full response body for the whole TTL.
// Bodies are written once and only read, so cloning buys nothing.
const cache = new NodeCache({
  stdTTL: 60,
  useClones: false,
  maxKeys: Number(process.env.RESPONSE_CACHE_MAX_KEYS || 500),
});

// Rate limiting — strict for anonymous traffic; authenticated SPA users get
// much higher headroom (dashboard + coach athlete switch can fire 20–40 GETs).
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 4000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});

// Apply global limiter only in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const hasBearer = typeof req.headers.authorization === 'string'
      && req.headers.authorization.startsWith('Bearer ');
    return (hasBearer ? authLimiter : publicLimiter)(req, res, next);
  });
}

// Dedicated limiter for login — 5 attempts per 15 minutes per IP (M6)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 login attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes before trying again.' },
  skip: (req) => req.method === 'OPTIONS'
});
app.use('/user/login', loginLimiter);

// Cache middleware
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    const key = req.originalUrl || req.url;
    const cachedResponse = cache.get(key);
    
    if (cachedResponse) {
      return res.send(cachedResponse);
    } else {
      res.originalSend = res.send;
      res.send = (body) => {
        // maxKeys makes set() throw once the cache is full — a full cache must
        // never turn into a failed response.
        try { cache.set(key, body, duration); } catch { /* cache full: serve uncached */ }
        res.originalSend(body);
      };
      next();
    }
  };
};

// Route Imports
const testRoutes = require("./routes/testRoutes");
const userListRoute = require("./routes/userListRoute");
const trainingRoute = require("./routes/trainingRoute");
const feedbackRoute = require("./routes/feedbackRoute");
const eventRoutes = require("./routes/eventRoutes");
const raceEventRoutes = require("./routes/raceEventRoutes");
const fitUploadRoute = require("./routes/fitUploadRoute");
const lactateSessionRoutes = require("./routes/lactateSessionRoutes");
const integrationsRoutes = require("./routes/integrationsRoutes");
const workoutClusteringRoutes = require("./routes/workoutClusteringRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const protocolTemplateRoutes = require('./routes/protocolTemplateRoutes');
const workoutPlannerRoutes  = require('./routes/workoutPlannerRoutes');
const calendarFeedRoutes    = require('./routes/calendarFeedRoutes');
const fieldLactateRoutes    = require('./routes/fieldLactateRoutes');
const cpTestRoutes          = require('./routes/cpTestRoutes');
const vlamaxTestRoutes      = require('./routes/vlamaxTestRoutes');
const emailCampaignRoutes   = require('./routes/emailCampaignRoutes');
const coachOutreachRoutes   = require('./routes/coachOutreachRoutes');
const emailLoginRoutes      = require('./routes/emailLoginRoutes');
const weeklyReviewRoutes    = require('./routes/weeklyReviewRoutes');
const lactateAnalyticsRoutes = require('./routes/lactateAnalyticsRoutes');
const healthRoutes          = require('./routes/healthRoutes');
const atpRoutes             = require('./routes/atpRoutes');
const dailyCardRoutes       = require('./routes/dailyCardRoutes');
const timelineRoutes        = require('./routes/timelineRoutes');
const { startWeeklyReportsScheduler } = require('./services/weeklyReportScheduler');
const { startStravaAutoSyncScheduler } = require('./services/stravaAutoSyncScheduler');
const { startLactateTestFollowUpScheduler } = require('./services/lactateTestFollowUpScheduler');
const { startRetentionScheduler } = require('./services/retentionScheduler');
const { startAppReengagementScheduler } = require('./services/appReengagementScheduler');
const { startGarminTokenRefreshScheduler } = require('./services/garminTokenRefreshScheduler');
const { startStreamBackfillScheduler } = require('./services/streamBackfillScheduler');
const { startWinBackScheduler } = require('./services/winBackScheduler');
const { startRaceReminderScheduler } = require('./services/raceReminderScheduler');
const { startTrainingAlertScheduler } = require('./services/trainingAlertScheduler');
const { startWeeklyDigestScheduler } = require('./services/weeklyDigestScheduler');
const { startCoachFridayReviewScheduler } = require('./services/coachFridayReviewScheduler');
const { bootstrapStravaWebhook } = require('./services/stravaWebhookBootstrap');

// Routes
app.use("/test", testRoutes);
app.use("/api/cp-test", cpTestRoutes);
app.use("/api/vlamax-test", vlamaxTestRoutes);
app.use("/user", userListRoute);
app.use("/training", trainingRoute);
app.use("/feedback", feedbackRoute);
app.use("/api/events", eventRoutes);
app.use("/api/race-events", raceEventRoutes);
app.use("/api/fit", fitUploadRoute);
app.use("/api/lactate-session", lactateSessionRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api/workout-clustering", workoutClusteringRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/protocol-templates', protocolTemplateRoutes);
app.use('/api/workout-planner',   workoutPlannerRoutes);
app.use('/api/calendar-feed',     calendarFeedRoutes);
app.use('/api/field-lactate',     fieldLactateRoutes);
app.use('/api/lactate-analytics', lactateAnalyticsRoutes);
app.use('/api/email',             emailCampaignRoutes);
app.use('/api/admin/coach-outreach', coachOutreachRoutes);
app.use('/api/auth',              emailLoginRoutes);
app.use('/api/weekly-reviews',    weeklyReviewRoutes);
app.use('/api/health',            healthRoutes);
app.use('/api/atp',               atpRoutes);
app.use('/api/daily-card',        dailyCardRoutes);
app.use('/api/timeline',          timelineRoutes);

// Weekly Strava summary emails (Mondays) - controlled by env
startWeeklyReportsScheduler();

// Strava auto-sync scheduler (periodic sync for all users with auto-sync enabled)
startStravaAutoSyncScheduler();

// Ensure Strava webhook subscription is registered (runs once on startup, idempotent)
setTimeout(() => bootstrapStravaWebhook().catch(e => console.error('[StravaWebhook] Bootstrap failed:', e.message)), 5000);

// Pick up any Strava backfills that were interrupted by the previous shutdown.
// Persisted state on user.strava.backfillState tells us who to resume; the
// concurrency cap inside startStravaHistoricalBackfill staggers them so we
// don't thunder-herd Strava on every redeploy.
setTimeout(() => {
  try {
    const {
      resumeInterruptedStravaBackfills,
      resumeShallowStravaBackfills,
    } = require('./routes/integrationsRoutes');
    if (typeof resumeInterruptedStravaBackfills === 'function') {
      resumeInterruptedStravaBackfills();
    }
    if (typeof resumeShallowStravaBackfills === 'function') {
      resumeShallowStravaBackfills();
    }
  } catch (e) {
    console.error('[StravaBackfill] resume hook failed on boot:', e?.message || e);
  }
}, 8000);

startLactateTestFollowUpScheduler();

// Race countdown / taper / post-race reminders
startRaceReminderScheduler();

// Training load / recovery alerts + Sunday push digest
startTrainingAlertScheduler();
startWeeklyDigestScheduler();
startCoachFridayReviewScheduler();

// Retention & lifecycle emails (weekly progress, monthly reports, milestones, re-engagement)
startRetentionScheduler();

// Web-only 3-step drip: app download → Strava → workout planning (Zoho-safe auto pacing)
startAppReengagementScheduler();

// Garmin OAuth2 tokens expire silently for webhook-only users — refresh ahead of time.
startGarminTokenRefreshScheduler();

// Per-second traces for the Balance chart. Runs on a tick rather than inside
// the request that draws the chart: that request arrives exactly when
// interactive Strava traffic peaks, so the bulk lane was refused every time.
startStreamBackfillScheduler();

// One-time win-back to lapsed free accounts. OFF unless ENABLE_WINBACK_SCHEDULER=true
// — a 435-person campaign is a deliberate decision, not a deploy side effect.
startWinBackScheduler();

// Apply cache middleware to routes that can be cached (reduced cache time for better data freshness)
app.use('/api/training', cacheMiddleware(60), trainingRoute);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LaChart API Documentation',
      version: '1.0.0',
      description: `
# LaChart API Documentation

## Entity Relationship Diagram
\`\`\`mermaid
erDiagram
    User ||--o{ Test : "creates"
    User ||--o{ Training : "creates"
    User {
        string _id
        string email
        string password
        string name
        string role
        date createdAt
        date updatedAt
    }
    Test {
        string _id
        string userId
        date date
        string sport
        number weight
        number baselineLactate
        array intervals
        date createdAt
        date updatedAt
    }
    Training {
        string _id
        string userId
        date date
        string type
        number duration
        number intensity
        string notes
        date createdAt
        date updatedAt
    }
\`\`\`

## API Endpoints
The following endpoints are available in the API.
      `,
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['user', 'coach', 'admin'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Test: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            userId: { type: 'string' },
            date: { type: 'string', format: 'date' },
            sport: { type: 'string' },
            weight: { type: 'number' },
            baselineLactate: { type: 'number' },
            intervals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  power: { type: 'number' },
                  heartRate: { type: 'number' },
                  lactate: { type: 'number' },
                  glucose: { type: 'number' },
                  rpe: { type: 'number' }
                }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Training: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            userId: { type: 'string' },
            date: { type: 'string', format: 'date' },
            type: { type: 'string' },
            duration: { type: 'number' },
            intensity: { type: 'number' },
            notes: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  },
  apis: ['./routes/*.js'], // Path to the API routes
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI — restricted to admin users only (M4)
const verifyToken = require('./middleware/verifyToken');
const swaggerAdminGuard = async (req, res, next) => {
  // Allow static asset requests (CSS, JS, images) through without auth
  if (req.path !== '/' && !req.path.endsWith('.json') && !req.path.endsWith('.yaml')) {
    return next();
  }
  try {
    await new Promise((resolve, reject) => {
      verifyToken(req, res, (err) => (err ? reject(err) : resolve()));
    });
  } catch {
    return; // verifyToken already sent the 401 response
  }
  const role = req.user?.role;
  const isAdmin = role === 'admin' || req.user?.admin === true;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required for API docs' });
  }
  next();
};
app.use('/api-docs', swaggerAdminGuard, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "LaChart API Documentation",
  customJs: [
    'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js',
    'https://cdn.jsdelivr.net/npm/swagger-ui-mermaid'
  ]
}));

// Health check endpoint for Render.com warmup. Also exposes the git commit
// the server was built from — invaluable for "is my fix actually live?"
// verification (without needing Render dashboard access).
const SERVER_COMMIT = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.COMMIT_SHA || null;
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    commit: SERVER_COMMIT,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Něco se pokazilo!',
    message: err.message 
  });
});

app.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));
