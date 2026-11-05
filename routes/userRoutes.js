const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// import express from 'express';
// import bcrypt from 'bcrypt';
// import pool from '../db.js'; // Adjust path to your database pool configuration file
// import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js'; // Adjust path to your auth middlewares

const router = express.Router();

// Get profile of logged-in user
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      // 'SELECT id, name, email, role, created_at, zone, territory, distributor_code FROM public.users WHERE id = $1',
      `
      SELECT 
    u.id, 
    u.name, 
    u.email, 
    u.role, 
    u.created_at, 
    u.zone, 
    u.territory, 
    u.distributor_code,
    d.distributor_name,
    u.status
FROM public.users u
LEFT JOIN public.distributor_master d ON u.distributor_code = d.distributor_code
ORDER BY u.id ASC;
      `
      [req.user.id]
    );
    res.json(userResult.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users (Admin only)
router.get('/all', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const usersResult = await pool.query(
      // 'SELECT id, name, email, role, created_at, zone, territory, distributor_code FROM public.users ORDER BY id ASC'
      `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.created_at, 
        u.zone, 
        u.territory, 
        u.distributor_code,
        d.distributor_name,
        u.status
      FROM public.users u
      LEFT JOIN public.distributor_master d ON u.distributor_code = d.distributor_code
      ORDER BY u.id ASC;
      `
    );
    res.json(usersResult.rows);
  } catch (err) {
    console.error("Database error:", err); // This will show up in your Render Server Logs
    res.status(500).json({ message: 'Server error', error: err.message });
    // res.status(500).json({ message: 'Server error' });
  }
});








// POST: Bulk Insert User Records
// router.post('/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
router.post('/bulk', async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const queryText = `
      INSERT INTO public.users (
        name,
        email,
        password,
        role,
        zone,
        territory,
        distributor_code,
        status,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($7, NOW())
      );
    `;

    for (const item of records) {
      const values = [
        item.name || null,
        item.email || null,
        item.password, // ensure hashed or default password
        item.role || 'user',
        item.zone || null,
        item.territory || null,
        item.distributor_code || null,
        item.status || null,
        item.created_at || null
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Bulk user insertion successful!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk User Insert Error:', err);
    res.status(500).json({ message: 'Database transaction error during bulk user insert.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Bulk Upsert Users (Update on Conflict by email)
// router.put('/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   const records = req.body;

//   if (!Array.isArray(records) || records.length === 0) {
//     return res.status(400).json({ message: 'Invalid or empty record set.' });
//   }

//   const client = await pool.connect();

//   try {
//     await client.query('BEGIN');

//     const queryText = `
//       INSERT INTO public.users (
//         name,
//         email,
//         password,
//         role,
//         zone,
//         territory,
//         distributor_code,
//         status,
//         created_at
//       ) VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($7, NOW())
//       )
//       ON CONFLICT (email) DO UPDATE SET
//         name = EXCLUDED.name,
//         role = EXCLUDED.role,
//         zone = EXCLUDED.zone,
//         territory = EXCLUDED.territory,
//         distributor_code = EXCLUDED.distributor_code,
//         status = EXCLUDED.status;
//     `;

//     for (const item of records) {
//       if (!item.email) continue;

//       const values = [
//         item.name || null,
//         item.email,
//         item.password,
//         item.role,
//         item.zone || null,
//         item.territory || null,
//         item.distributor_code || null,
//         item.status || 'Active',
//         item.created_at || null
//       ];

//       await client.query(queryText, values);
//     }

//     await client.query('COMMIT');
//     res.status(200).json({ message: 'Bulk user update/upsert successful!' });
//   } catch (err) {
//     await client.query('ROLLBACK');
//     console.error('Bulk User Upsert Error:', err);
//     res.status(500).json({ message: 'Database error during bulk user update.', error: err.message });
//   } finally {
//     client.release();
//   }
// });

// const bcrypt = require('bcrypt');

router.put('/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const queryText = `
      INSERT INTO public.users (
        name,
        email,
        password,
        role,
        zone,
        territory,
        distributor_code,
        status,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW())
      )
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        zone = EXCLUDED.zone,
        territory = EXCLUDED.territory,
        distributor_code = EXCLUDED.distributor_code,
        status = EXCLUDED.status,
        -- Optionally update password if a new one is explicitly provided
        password = CASE 
          WHEN EXCLUDED.password IS NOT NULL AND EXCLUDED.password != public.users.password 
          THEN EXCLUDED.password 
          ELSE public.users.password 
        END;
    `;

    for (const item of records) {
      if (!item.email) continue;

      let hashedPassword = item.password;

      // Check if password exists and is not already a bcrypt hash
      if (hashedPassword && !hashedPassword.startsWith('$2b$') && !hashedPassword.startsWith('$2a$')) {
        const saltRounds = 10;
        hashedPassword = await bcrypt.hash(hashedPassword, saltRounds);
      }

      const values = [
        item.name || null,
        item.email,
        hashedPassword || null,
        item.role,
        item.zone || null,
        item.territory || null,
        item.distributor_code || null,
        item.status || 'Active',
        item.created_at || null
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Bulk user upsert with automatic password hashing successful!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk User Upsert Error:', err);
    res.status(500).json({ message: 'Database error during bulk user update.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Single Record Update by primary key ID
router.put('/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const item = req.body;

  if (!id) {
    return res.status(400).json({ message: 'User ID parameter is required.' });
  }

  const client = await pool.connect();

  try {
    const queryText = `
      UPDATE public.users
      SET
        name = $1,
        email = $2,
        role = $3,
        zone = $4,
        territory = $5,
        distributor_code = $6,
        status = $7
      WHERE id = $8
      RETURNING id, name, email, role, zone, territory, distributor_code, status, created_at;
    `;

    const values = [
      item.name || null,       // $1
      item.email || null,      // $2
      item.role || null,     // $3
      item.zone || null,       // $4
      item.territory || null,  // $5
      item.distributor_code || null, //$6
      item.status || 'Active', //$7
      id                       // $8
    ];

    const result = await client.query(queryText, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: `User with ID '${id}' not found.` });
    }

    res.status(200).json({
      message: 'User updated successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Single User Update Error:', err);
    res.status(500).json({ message: 'Database error during user update.', error: err.message });
  } finally {
    client.release();
  }
});

// POST: Single Record ADD / Register User
router.post('/register', async (req, res) => {
  const item = req.body;

  if (!item.email || !item.name || !item.password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  const client = await pool.connect();

  try {
    // 1. Hash the incoming plain text password securely
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(item.password, saltRounds);

    const queryText = `
      INSERT INTO public.users (
        name,
        email,
        password,
        role,
        zone,
        territory,
        distributor_code,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, name, email, role, zone, territory, distributor_code, created_at;
    `;

    const values = [
      item.name,
      item.email,
      hashedPassword, // <-- Save the hashed version, not item.password!
      item.role || 'user',
      item.zone || null,
      item.territory || null,
      item.distributor_code || null
    ];

    const result = await client.query(queryText, values);

    res.status(201).json({
      message: 'User added successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Single User Insert Error:', err);
    res.status(500).json({ message: 'Database error during user creation.', error: err.message });
  } finally {
    client.release();
  }
});

// DELETE: Delete Single User by Primary Key ID
router.delete('/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Query parameter "id" is required.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM public.users WHERE id = $1 RETURNING id, name, email',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User record not found.' });
    }

    res.status(200).json({ message: 'User deleted successfully.', deletedRecord: result.rows[0] });
  } catch (err) {
    console.error('Delete User Error:', err);
    res.status(500).json({ message: 'Database error while deleting user record.', error: err.message });
  }
});

module.exports = router;
