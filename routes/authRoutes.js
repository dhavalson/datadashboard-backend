const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { generateAccessToken, generateRefreshToken } = require('../utils/tokenUtils');

const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');



router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // 1. Fetch user from DB
    const userResult = await pool.query(
      'SELECT * FROM public.users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // 2. Validate Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // 3. Generate Access Token (Short-Lived: 15 mins)
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        zone: user.zone,
        territory: user.territory,
      },
      process.env.JWT_SECRET || 'your_access_secret',
      { expiresIn: '15m' }
    );

    // 4. Generate Refresh Token (Long-Lived: 7 days)
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.REFRESH_TOKEN_SECRET || 'your_refresh_secret',
      { expiresIn: '7d' }
    );

    // Optional: Save refreshToken in database if you want server-side session revocation
    await pool.query('UPDATE public.users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax', // use lax for local, strict on railway
      maxAge: 10 * 60 * 1000 // 15 mins matching access token expiry
    });

    // 5. Send Refresh Token in an HttpOnly Cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false, // Set to true in HTTPS production
      sameSite: 'lax', // use lax for local, strict on railway
      path: '/refresh', // Restricted strictly to the refresh endpoint
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // 6. Return Access Token & User Info
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        zone: user.zone,
        territory: user.territory,
      },
    });

  } catch (err) {
    console.error('--- CRITICAL BACKEND LOGIN ERROR ---', err);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: err.message,
    });
  }
});
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(400).json({ message: 'Invalid credentials' });
//     }

//     const token = jwt.sign(
//       {
//         id: user.id,
//         email: user.email,
//         role: user.role,
//         name: user.name,
//         zone: user.zone,
//         territory: user.territory
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: '1h' }
//     );

//     // 1. Set httpOnly cookie
//     res.cookie('token', token, {
//       httpOnly: true, // Prevents XSS token theft
//       // secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
//       secure: false, // Must be FALSE on http://localhost (no HTTPS)
//       // sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // Prevents cross-port drops during local testing
//       path: '/',     // REQUIRED: Ensures the cookie is sent for ALL API routes
//       sameSite: 'lax', // Fixes local cross-port cookie dropping
//       maxAge: 60 * 60 * 1000 // 1 hour
//     });

//     // 2. Return user info ONLY (Token is handled strictly by browser cookie storage)
//     res.json({
//       message: 'Login successful',
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//         zone: user.zone,
//         territory: user.territory
//       }
//     });
//   } catch (err) {
//     console.error('Login Route Error:', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.post('/logout', verifyToken, (req, res) => {
//   res.clearCookie('token', {
//     httpOnly: true,
//     secure: false, // Match login settings for local dev
//     sameSite: 'lax', // Match login settings
//     path: '/'        // Match login settings
//   });
//   return res.status(200).json({ message: 'Logged out successfully' });
// });

// router.post('/register', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   // Destructure zone and territory from req.body
//   const { name, email, password, role, zone, territory } = req.body;

//   try {
//     // 1. Check if user already exists
//     const userExists = await pool.query('SELECT * FROM public.users WHERE email = $1', [email]);
//     if (userExists.rows.length > 0) {
//       return res.status(400).json({ message: 'User with this email already exists.' });
//     }

//     // 2. Hash password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(password, salt);

//     // 3. Insert user with safe defaults for zone & territory
//     const newUser = await pool.query(
//       'INSERT INTO public.users (name, email, password, role, zone, territory) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, zone, territory',
//       [name, email, hashedPassword, role || 'employee', zone || null, territory || null]
//     );

//     res.status(201).json({
//       message: 'User registered successfully',
//       user: newUser.rows[0]
//     });
//   } catch (err) {
//     console.error("REGISTER ERROR:", err);
//     res.status(500).json({ message: 'Server error', detail: err.message });
//   }
// });




router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token missing' });
    }

    // 1. Verify Refresh Token signature
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET || 'your_refresh_secret'
    );

    // 2. Retrieve user and verify token matching in DB
    const userResult = await pool.query(
      'SELECT id, email, role, name, zone, territory, refresh_token FROM public.users WHERE id = $1',
      [decoded.id]
    );
    const user = userResult.rows[0];

    if (!user || user.refresh_token !== refreshToken) {
      return res.status(403).json({ message: 'Invalid or revoked refresh token' });
    }

    // 3. Issue New Short-Lived Access Token
    const newAccessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        zone: user.zone,
        territory: user.territory,
      },
      process.env.JWT_SECRET || 'your_access_secret',
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      token: newAccessToken,
    });

  } catch (err) {
    console.error('Refresh Token Error:', err);
    return res.status(403).json({ message: 'Expired or invalid refresh token' });
  }
});

router.post('/logout', verifyToken, async (req, res) => {
  try {
    // Invalidate refresh token in database
    if (req.user?.id) {
      await pool.query('UPDATE public.users SET refresh_token = NULL WHERE id = $1', [req.user.id]);
    }

    // Clear Cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/refresh'
    });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Logout failed', error: err.message });
  }
});

module.exports = router;