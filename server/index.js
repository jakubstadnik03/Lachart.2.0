const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");

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

// Route Imports
const testRoutes = require("./routes/testRoutes");
const userListRoute = require("./routes/userListRoute");
const trainingRoute = require("./routes/trainingRoute");

// Routes
app.use("/test", testRoutes);
app.use("/user", userListRoute);
app.use("/training", trainingRoute);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Něco se pokazilo!',
    message: err.message 
  });
});

app.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));
