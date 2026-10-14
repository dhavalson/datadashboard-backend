const express = require('express');
const pool = require('../db');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// GET: Fetch payment records based on role-based access control
router.get('/paymentreceived', verifyToken, async (req, res) => {
  try {
    const { role, zone, territory } = req.user;

    // let query = `
    //   SELECT 
    //     id,
    //     distributor_name,
    //     date_of_receipt,
    //     month,
    //     gst_no,
    //     channel,
    //     amount,
    //     account,
    //     created_at
    //   FROM public.payment_received
    // `;

     let query = `
            SELECT
              py.*,
              dm.zone,
              dm.territory
            FROM public.payment_received py
            LEFT JOIN public.distributor_master dm
              ON UPPER(TRIM(py.gst_no)) = UPPER(TRIM(dm.gst_no))
        `;

    let params = [];

    if (role === 'admin') {
      // Admin sees all records
      query += ' ORDER BY id DESC';
    } else if (role === 'employee') {
      // Employee sees payments filtered by zone (if mapped in your distributor table/view)
      query += ' WHERE zone = $1 ORDER BY id DESC';
      params.push(zone);
    } else if (role === 'user') {
      // User sees payments filtered by territory (if mapped in your distributor table/view)
      query += ' WHERE territory = $1 ORDER BY id DESC';
      params.push(territory);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('FETCH ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST: Bulk Insert Payment Records (Parameterized UNNEST Batch Query)
router.post('/paymentreceived/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const queryText = `
      INSERT INTO public.payment_received (
        distributor_name,
        date_of_receipt,
        month,
        gst_no,
        channel,
        amount,
        account,
        created_at
      )
      SELECT 
        t.distributor_name,
        t.date_of_receipt,
        t.month,
        t.gst_no,
        t.channel,
        t.amount,
        t.account,
        NOW()
      FROM UNNEST(
        $1::text[],
        $2::date[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::numeric[],
        $7::text[]
      ) AS t(distributor_name, date_of_receipt, month, gst_no, channel, amount, account);
    `;

    const distributorNames = records.map((r) => r.distributor_name || null);
    const datesOfReceipt = records.map((r) => r.date_of_receipt || null);
    const months = records.map((r) => r.month || null);
    const gstNos = records.map((r) => r.gst_no || null);
    const channels = records.map((r) => r.channel || null);
    const amounts = records.map((r) => r.amount ?? null);
    const accounts = records.map((r) => r.account || null);

    await client.query(queryText, [
      distributorNames,
      datesOfReceipt,
      months,
      gstNos,
      channels,
      amounts,
      accounts
    ]);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Bulk payment insertion successful!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk Insert Error:', err);
    res.status(500).json({ message: 'Database transaction error during bulk insert.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Bulk Upsert (Update on Conflict by ID)
router.put('/paymentreceived/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const queryText = `
      INSERT INTO public.payment_received (
        id,
        distributor_name,
        date_of_receipt,
        month,
        gst_no,
        channel,
        amount,
        account,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        distributor_name = EXCLUDED.distributor_name,
        date_of_receipt = EXCLUDED.date_of_receipt,
        month = EXCLUDED.month,
        gst_no = EXCLUDED.gst_no,
        channel = EXCLUDED.channel,
        amount = EXCLUDED.amount,
        account = EXCLUDED.account;
    `;

    for (const item of records) {
      if (!item.id) continue;

      const values = [
        item.id,
        item.distributor_name || null,
        item.date_of_receipt || null,
        item.month || null,
        item.gst_no || null,
        item.channel || null,
        item.amount ?? null,
        item.account || null
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Bulk payment update successful!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk Update Error:', err);
    res.status(500).json({ message: 'Database error during bulk update.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Single Record Update by Primary Key ID
router.put('/paymentreceived/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const item = req.body;

  if (!id) {
    return res.status(400).json({ message: 'Payment ID parameter is required.' });
  }

  const client = await pool.connect();

  try {
    const queryText = `
      UPDATE public.payment_received
      SET
        distributor_name = $1,
        date_of_receipt = $2,
        month = $3,
        gst_no = $4,
        channel = $5,
        amount = $6,
        account = $7
      WHERE id = $8
      RETURNING *;
    `;

    const values = [
      item.distributor_name || null, // $1
      item.date_of_receipt || null,  // $2
      item.month || null,             // $3
      item.gst_no || null,            // $4
      item.channel || null,           // $5
      item.amount ?? null,            // $6
      item.account || null,           // $7
      id                              // $8
    ];

    const result = await client.query(queryText, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: `Payment record with ID '${id}' not found.` });
    }

    res.status(200).json({
      message: 'Payment record updated successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Single Record Update Error:', err);
    res.status(500).json({ message: 'Database error during update.', error: err.message });
  } finally {
    client.release();
  }
});

// DELETE: Delete Single Payment Record by Primary Key ID
router.delete('/paymentreceived/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Parameter "id" is required.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM public.payment_received WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    res.status(200).json({ message: 'Payment record deleted successfully.', deletedRecord: result.rows[0] });
  } catch (err) {
    console.error('Delete Record Error:', err);
    res.status(500).json({ message: 'Database error while deleting record.', error: err.message });
  }
});

module.exports = router;