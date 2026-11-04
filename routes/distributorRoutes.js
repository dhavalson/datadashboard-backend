const express = require('express');
const pool = require('../db');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const {buildFilterQuery} = require('../utils/filterService')

const router = express.Router();

// GET: Fetch distributor records based on role-based access control
router.get('/distributormaster', verifyToken, async (req, res) => {
  // try {
    // const { role, zone, territory, distributor_code } = req.user;
    // const userFilters = {
    //         distributor_code: req.user.distributor_code,
    //         territory: req.user.territory,
    //         zone: req.user.zone,
    //         role: req.user.role
    //     };
        // If the user is an admin, pass empty filters so ALL records are fetched.
    // Otherwise, pass the scoped user filters.
    // const userFilters = (role === 'Admin' || 'Employee') 
    //   ? { distributor_code: null, territory: null, zone: null } 
    //   : { distributor_code, territory, zone };
    // const activeDistributors = await getFilteredData(pool, 'distributor_master', userFilters, "status = 'Active'");  
    // const activeDistributors = await getFilteredData(pool, 'distributor_master', userFilters = req.user, null, orderByColumn = 'distributor_name');
    //     // console.log(role, zone, territory, distributor_code);
    

//     let query = `
//       SELECT 
//         id,
//         distributor_code,
//         distributor_name,
//         gst_no,
//         state,
//         city,
//         pincode,
//         territory,
//         zone,
//         status,
//         allowed_category,        
//         created_at,
//         updated_at
//       FROM public.distributor_master
 
//     `;
//     // FROM public.distributor_master
//     //   WHERE status = 'Active'
//     let params = [];

//     // if (role === 'admin') {
//     //   // Admin sees all records
//     //   query += ' ORDER BY distributor_name ASC';
//     // } else if (role === 'employee') {
//     //   // Employee sees distributors within their assigned Zone
//     //   query += ' WHERE zone = $1 ORDER BY distributor_name ASC';
//     //   params.push(zone);
//     // } else if (role === 'user') {
//     //   // User sees distributors within their assigned Territory
//     //   query += ' WHERE territory = $1 ORDER BY distributor_name ASC';
//     //   params.push(territory);
//     // }

// if (role === 'admin') {
//       // Admin sees all records
//       query += '';
//     } else if (distributor_code && distributor_code.trim() !== '') {
//     // 1. If distributor_code exists, filter strictly by distributor_code
//     query += ' WHERE distributor_code = $1';
//     params.push(distributor_code);
// } else if (territory && territory.trim() !== '') {
//     // 2. If no distributor_code, but territory exists, filter by territory
//     query += ' WHERE territory = $1';
//     params.push(territory);
// } else if (zone && zone.trim() !== '') {
//     // 3. If neither distributor_code nor territory exists, filter by zone
//     query += ' WHERE zone = $1';
//     params.push(zone);
// }
// // Always order the final result alphabetically
// query += ' ORDER BY distributor_name ASC';

//     const result = await pool.query(query, params);
    // res.json(result.rows);
    try {
    // 1. Write your custom table query with any joins you need
    let query = `
      SELECT 
        d.id,
        d.distributor_code,
        d.distributor_name,
        d.gst_no,
        d.territory,
        d.zone,
        d.state,
        d.pincode,
        d.city,
        d.status,
        d.allowed_category
        
      FROM public.distributor_master d
      LEFT JOIN public.users u ON d.distributor_code = u.distributor_code
      
      
    `;

    // 2. Generate the dynamic RBAC/territory filters from your service 
    // (Note: start parameter index at 1 if no other $1 exists, or 2 if 'd.status = \'Active\'' uses $1)
    const { whereClause, params } = buildFilterQuery(req.user, 1);

    // 3. If a security filter exists, append it with an AND (since WHERE already exists)
    if (whereClause) {
      query += ` AND ${whereClause.replace('WHERE', '')}`;
    }

    // 4. Add sorting
    query += ` ORDER BY d.distributor_name ASC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('FETCH ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST: Bulk Insert Distributor Records
router.post('/distributormaster/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const queryText = `
      INSERT INTO public.distributor_master (
        distributor_code,
        distributor_name,
        gst_no,
        state,
        city,
        pincode,
        territory,
        zone,
        status,
        allowed_category,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $7, $8, $9, $10, NOW(), NOW()
      );
    `;

    for (const item of records) {
      const values = [
        item.distributor_code || null,
        item.distributor_name || null,
        item.gst_no || null,
        item.state || null,
        item.city || null,
        item.pincode || null,
        item.territory || null,
        item.zone || null,
        item.status || null,
        item.allowed_category || null,
        // item.status
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Bulk insertion successful!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk Insert Error:', err);
    res.status(500).json({ message: 'Database transaction error during bulk insert.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Bulk Upsert (Update on Conflict by distributor_code)
router.put('/distributormaster/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const queryText = `
      INSERT INTO public.distributor_master (
        distributor_code,
        distributor_name,
        gst_no,
        state,
        city,
        pincode,
        territory,
        zone,
        status,
        allowed_category,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, string_to_array($10, ','), NOW(), NOW()
      )
      ON CONFLICT (distributor_code) DO UPDATE SET
        distributor_name = EXCLUDED.distributor_name,
        gst_no = EXCLUDED.gst_no,
        state = EXCLUDED.state,
        city = EXCLUDED.city,
        pincode = EXCLUDED.pincode,
        territory = EXCLUDED.territory,
        zone = EXCLUDED.zone,
        status = EXCLUDED.status,
        allowed_category = EXCLUDED.allowed_category,        
        updated_at = NOW();
    `;

    for (const item of records) {
      if (!item.distributor_code) continue;

      const values = [
        item.distributor_code,
        item.distributor_name || null,
        item.gst_no || null,
        item.state || null,
        item.city || null,
        item.pincode || null,
        item.territory || null,
        item.zone || null,
        item.status || null,
        item.allowed_category || null,
        // item.status || null
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Bulk update successful!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk Update Error:', err);
    res.status(500).json({ message: 'Database error during bulk update.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Single Record Update by primary key ID
router.put('/distributormaster/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const item = req.body;

  if (!id) {
    return res.status(400).json({ message: 'Distributor ID parameter is required.' });
  }

  const client = await pool.connect();

  try {
    const queryText = `
      UPDATE public.distributor_master
      SET
        distributor_code = $1,
        distributor_name = $2,
        gst_no = $3,
        state = $4,
        city = $5,
        pincode = $6,
        territory = $7,
        zone = $8,
        status = $9,
        allowed_category = $10,        
        updated_at = NOW()
      WHERE id = $11
      RETURNING *;
    `;

    const values = [
      item.distributor_code || null, // $1
      item.distributor_name || null, // $2
      item.gst_no || null,           // $3
      item.state || null,
      item.city || null,
      item.pincode || null,
      item.territory || null,        // $4
      item.zone || null, 
      item.status || null,            // $5
      item.allowed_category || null, //$6
      // item.status || null,
      id                             // $7
    ];

    const result = await client.query(queryText, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: `Distributor with ID '${id}' not found.` });
    }

    res.status(200).json({
      message: 'Distributor updated successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Single Record Update Error:', err);
    res.status(500).json({ message: 'Database error during update.', error: err.message });
  } finally {
    client.release();
  }
});


// POST: Single Record ADD by primary key ID
router.post('/distributormaster', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const item = req.body;

  // Simple validation to ensure required fields exist
  if (!item.distributor_code || !item.distributor_name) {
    return res.status(400).json({ message: 'Distributor code and name are required.' });
  }

  const client = await pool.connect();

  try {
    const queryText = `
      INSERT INTO public.distributor_master (
        distributor_code,
        distributor_name,
        gst_no,
        state,
        city,
        pincode,
        territory,
        zone,
        status,
        allowed_category,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *;
    `;

    const values = [
      item.distributor_code,
      item.distributor_name,
      item.gst_no || null,
      item.state || null,
      item.city || null,
      item.pincode || null,
      item.territory || null,
      item.zone || null,
      item.status || null,
      item.allowed_category || null,
      
    ];

    const result = await client.query(queryText, values);

    res.status(201).json({
      message: 'Distributor added successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Single Record Insert Error:', err);
    res.status(500).json({ message: 'Database error during insertion.', error: err.message });
  } finally {
    client.release();
  }
});

// DELETE: Delete Single Distributor by Primary Key ID
router.delete('/distributormaster/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Query parameter "id" is required.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM public.distributor_master WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Distributor record not found.' });
    }

    res.status(200).json({ message: 'Distributor deleted successfully.', deletedRecord: result.rows[0] });
  } catch (err) {
    console.error('Delete Record Error:', err);
    res.status(500).json({ message: 'Database error while deleting record.', error: err.message });
  }
});

module.exports = router;