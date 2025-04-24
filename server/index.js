const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 8000;

// ✅ CORS nastavení – povolí localhost i Vercel doménu
const allowedOrigins = [
  'http://localhost:3000',
  'https://lachart-bc.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

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
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

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

// Routes
app.use("/test", testRoutes);
app.use("/user", userListRoute);
app.use("/training", trainingRoute);

// Apply cache middleware to routes that can be cached
app.use('/api/training', cacheMiddleware(600), trainingRoute);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Něco se pokazilo!',
    message: err.message 
  });
});

app.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));
