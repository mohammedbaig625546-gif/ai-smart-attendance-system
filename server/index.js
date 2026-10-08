/**
 * Feedback & Attendance Server
 * Main Express Application
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { isFirebaseConfigured, getConfigErrorMessage, getDb } = require('./config/firebase');
const { seedDefaultCoursesIfEmpty } = require('./services/courseService');

const courseRoutes = require('./routes/courseRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');

const { sanitizeBaseUrl } = require('./config/network');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Production & Development CORS
const allowedOrigins = [
  sanitizeBaseUrl(process.env.PUBLIC_APP_URL),
  sanitizeBaseUrl(process.env.VITE_API_URL),
  process.env.VERCEL_PROJECT_PRODUCTION_URL ? sanitizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) : null,
  process.env.VERCEL_URL ? sanitizeBaseUrl(process.env.VERCEL_URL) : null,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000'
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = allowedOrigins.some(allowed => {
      try {
        return new URL(allowed).origin === new URL(origin).origin;
      } catch (e) {
        return allowed === origin;
      }
    });

    const isVercelDomain = /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin);
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);

    if (isExplicitlyAllowed || isVercelDomain || isLocalhost || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error(`CORS Error: Origin ${origin} not permitted.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Uid', 'X-User-Email', 'X-User-Role']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/courses', courseRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/attendance', attendanceRoutes);

// Direct Student Feedback Portal route from QR Code scan
app.get('/student/feedback', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/student-feedback.html'));
});

// Health & Status check endpoint
app.get('/api/status', (req, res) => {
  const configured = isFirebaseConfigured();
  res.json({
    status: 'ONLINE',
    firebaseConfigured: configured,
    message: configured
      ? "Firebase Authentication and Firestore are connected and ready."
      : getConfigErrorMessage(),
    timestamp: new Date().toISOString()
  });
});

// Single Page Application fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server and seed initial database records
let server = null;
if (require.main === module) {
  server = app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`FEEDBACK & ATTENDANCE SYSTEM RUNNING ON PORT ${PORT}`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Firebase Configured: ${isFirebaseConfigured() ? 'YES (Connected)' : 'NO'}`);
    if (!isFirebaseConfigured()) {
      console.warn(`[WARNING]: ${getConfigErrorMessage()}`);
    }
    try {
      await seedDefaultCoursesIfEmpty();
    } catch (err) {
      console.error('[Error seeding default courses]:', err.message);
    }
    console.log(`====================================================`);
  });
}

module.exports = { app, server };
