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

// ✅ CORS configuration – allow local, Vercel preview, and production domain
const allowedOrigins = [
  'http://localhost:3000',
  'https://lachart-bc.vercel.app',
  'https://lachart.net',
  'https://www.lachart.net'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses

// Základní middleware
app.use(express.json());

// Logování pro debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Initialize cache
const cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => req.method === 'OPTIONS' // don't limit preflight
});

// Apply global limiter only in production
if (process.env.NODE_ENV === 'production') {
  app.use(limiter);
}

// Dedicated limiter for login to prevent abuse but allow normal usage
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // up to 30 login attempts per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again later.',
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
        cache.set(key, body, duration);
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
const fitUploadRoute = require("./routes/fitUploadRoute");

// Routes
app.use("/test", testRoutes);
app.use("/user", userListRoute);
app.use("/training", trainingRoute);
app.use("/feedback", feedbackRoute);
app.use("/api/events", eventRoutes);
app.use("/api/fit", fitUploadRoute);

// Apply cache middleware to routes that can be cached
app.use('/api/training', cacheMiddleware(600), trainingRoute);

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

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "LaChart API Documentation",
  customJs: [
    'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js',
    'https://cdn.jsdelivr.net/npm/swagger-ui-mermaid'
  ]
}));

// Health check endpoint for Render.com warmup
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
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
