const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
// const transportRoutes = require('./routes/transportRoutes');
// const RSSRoutes = require('./routes/RSSRoutes');
// const salesReturnRoutes = require('./routes/salesReturnRoutes');
// const reportRoutes = require('./routes/reportRoutes');
const distributorRoutes = require('./routes/distributorRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');
const productRoutes = require('./routes/productRoutes');
const primaryOrdersRoutes = require('./routes/primaryOrdersRoutes');

const app = express();

// 1. SECURITY HEADERS
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. CORS CONFIGURATION
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Uses Render env variable or falls back to localhost
    credentials: true,                           // Allows httpOnly cookie sharing
  })
);

// 3. BODY PARSERS & COOKIES
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// 4. RATE LIMITERS
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // Limit each IP to 5 attempts per window
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,    // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,     // Disable `X-RateLimit-*` headers
});

// Apply login rate limiter specifically to the login path
app.use('/api/auth/login', loginLimiter);

// 5. APPLICATION ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/distributors', distributorRoutes);
app.use('/api/users', userRoutes);
// app.use('/api/transport', transportRoutes);
// app.use('/api/rss', RSSRoutes);
// app.use('/api/salesreturn', salesReturnRoutes);
// app.use('/api/report', reportRoutes);
// app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/primaryorders', primaryOrdersRoutes);

// 6. SERVER INITIALIZATION
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));