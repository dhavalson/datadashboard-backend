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
    console.log(email);
    console.log(password);

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
      secure: process.env.NODE_ENV === 'production', // Set to true in HTTPS production
      sameSite: process.env.NODE_ENV === 'production'?'strict':'lax', // use lax for local, strict on railway
      maxAge: 10 * 60 * 1000 // 15 mins matching access token expiry
    });

    // 5. Send Refresh Token in an HttpOnly Cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in HTTPS production
      sameSite: process.env.NODE_ENV === 'production'?'strict':'lax', // use lax for local, strict on railway
      path: '/', // Restricted strictly to the refresh endpoint
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
      secure: process.env.NODE_ENV === 'production', // Set to true in HTTPS production
      sameSite: process.env.NODE_ENV === 'production'?'strict':'lax', // use lax for local, strict on railway
      path: '/'
    });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Logout failed', error: err.message });
  }
});

module.exports = router;
