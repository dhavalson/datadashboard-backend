const express = require('express');
const pool = require('../db');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper functions for data sanitization
const sanitizeDate = (dateVal) => {
  if (!dateVal || String(dateVal).trim() === '' || dateVal === '-') return null;
  return dateVal;
};

const sanitizeNumber = (numVal) => {
  if (numVal === null || numVal === undefined || String(numVal).trim() === '' || numVal === '-') return 0;
  // Strip non-numeric characters (except decimals) if formatted like "175,219"
  const cleanNum = String(numVal).replace(/,/g, '').trim();
  const parsed = parseFloat(cleanNum);
  return isNaN(parsed) ? 0 : parsed;
};

// GET: Fetch all records based on user role (Admin/Employee/User)
router.get('/retailsalessummary', verifyToken, async (req, res) => {
  try {
    const { role, zone, territory } = req.user;

    // let query = 'SELECT * FROM public.retail_sales_summary';
    let query = `
            SELECT 
                sales.*,
                dm.zone,
                dm.territory
            FROM public.retail_sales_summary sales
            LEFT JOIN public.distributor_master dm 
                ON UPPER(TRIM(sales.gst_no)) = UPPER(TRIM(dm.gst_no))
                `
    let params = [];

    if (role === 'admin') {
      // Admin sees everything
      query += ' ORDER BY invoice_date DESC';
    } else if (role === 'employee') {
      // Employee sees all entries in their Zone
      query += ' WHERE zone = $1 ORDER BY invoice_date DESC';
      params.push(zone);
    } else if (role === 'user') {
      // User sees entries in their Territory
      query += ' WHERE territory = $1 ORDER BY invoice_date DESC';
      params.push(territory);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('FETCH ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST: Bulk Upload Excel Records
router.post('/retailsalessummary/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Start transaction

    const queryText = `
      INSERT INTO public.retail_sales_summary (
        particular, state, zone, territory, gst_no, bill_no, category, challan_no,
        invoice_date, eway_bill_date, taxable_amt, tax_amt, total_amt,
        no_of_box, no_of_pcs, remark, cd_reason
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      );
    `;

    for (const item of records) {
      const values = [
        item.particular || null,
        item.state || null,
        item.zone || null,
        item.territory || null,
        item.gst_no || null,
        item.bill_no || null,
        item.category || null,
        item.challan_no,
        sanitizeDate(item.invoice_date),
        sanitizeDate(item.eway_bill_date),
        sanitizeNumber(item.taxable_amt),
        sanitizeNumber(item.tax_amt),
        sanitizeNumber(item.total_amt),
        sanitizeNumber(item.no_of_box),
        sanitizeNumber(item.no_of_pcs),
        item.remark || null,
        item.cd_reason || null
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT'); // Commit transaction
    res.status(201).json({ message: 'Bulk insertion successful!' });
  } catch (err) {
    await client.query('ROLLBACK'); // Rollback on failure
    console.error('Bulk Insert Error:', err);
    res.status(500).json({ message: 'Database transaction error during bulk insert.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Bulk Upsert (Update on Conflict by challan_no)
router.put('/retailsalessummary/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Start transaction

    const queryText = `
      INSERT INTO public.retail_sales_summary (
        particular, state, zone, territory, gst_no, bill_no, category, challan_no,
        invoice_date, eway_bill_date, taxable_amt, tax_amt, total_amt,
        no_of_box, no_of_pcs, remark, cd_reason
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      ON CONFLICT (bill_no) DO UPDATE SET
        particular = EXCLUDED.particular,
        state = EXCLUDED.state,
        zone = EXCLUDED.zone,
        territory = EXCLUDED.territory,
        gst_no = EXCLUDED.gst_no,
        bill_no = EXCLUDED.bill_no,
        category = EXCLUDED.category,
        invoice_date = EXCLUDED.invoice_date,
        eway_bill_date = EXCLUDED.eway_bill_date,
        taxable_amt = EXCLUDED.taxable_amt,
        tax_amt = EXCLUDED.tax_amt,
        total_amt = EXCLUDED.total_amt,
        no_of_box = EXCLUDED.no_of_box,
        no_of_pcs = EXCLUDED.no_of_pcs,
        remark = EXCLUDED.remark,
        cd_reason = EXCLUDED.cd_reason;
    `;

    for (const item of records) {
      // Ignore empty bill_no rows
      if (!item.bill_no) continue;

      const values = [
        item.particular || null,
        item.state || null,
        item.zone || null,
        item.territory || null,
        item.gst_no || null,
        item.bill_no,
        item.category || null,
        item.challan_no || null,
        sanitizeDate(item.invoice_date),
        sanitizeDate(item.eway_bill_date),
        sanitizeNumber(item.taxable_amt),
        sanitizeNumber(item.tax_amt),
        sanitizeNumber(item.total_amt),
        sanitizeNumber(item.no_of_box),
        sanitizeNumber(item.no_of_pcs),
        item.remark || null,
        item.cd_reason || null
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT'); // Commit transaction
    res.status(200).json({ message: 'Bulk update successful!' });
  } catch (err) {
    await client.query('ROLLBACK'); // Rollback on failure
    console.error('Bulk Update Error:', err);
    res.status(500).json({ message: 'Database error during bulk update.', error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Single Record Update by decoded challan_no
router.put('/retailsalessummary/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const bill_no = decodeURIComponent(req.params.bill_no);
  const item = req.body;
  const {id} = req.params;

  if (!id) {
    return res.status(400).json({ message: 'id parameter is required.' });
  }

  const client = await pool.connect();

  try {
    const queryText = `
      UPDATE public.retail_sales_summary
      SET
        particular = $1,
        state = $2,
        zone1 = $3,
        territory1 = $4,
        gst_no = $5,
        challan_no = $6,
        category = $7,
        invoice_date = $8,
        eway_bill_date = $9,
        taxable_amt = $10,
        tax_amt = $11,
        total_amt = $12,
        no_of_box = $13,
        no_of_pcs = $14,
        remark = $15,
        cd_reason = $16,
        bill_no = $17
      WHERE id = $18
      RETURNING *;
    `;

    const values = [
      item.particular || null,            // $1
      item.state || null,                 // $2
      item.zone1 || null,                 // $3
      item.territory1 || null,             // $4
      item.gst_no || null,                // $5
      item.challan_no || null,           // $6
      item.category || null,              // $7
      sanitizeDate(item.invoice_date),    // $8
      sanitizeDate(item.eway_bill_date),  // $9
      sanitizeNumber(item.taxable_amt),   // $10
      sanitizeNumber(item.tax_amt),       // $11
      sanitizeNumber(item.total_amt),     // $12
      sanitizeNumber(item.no_of_box),     // $13
      sanitizeNumber(item.no_of_pcs),     // $14
      item.remark || null,                // $15
      item.cd_reason || null,             // $16
      item.bill_no || null,               // $17
      id                                  // $18 (Matches WHERE id = $18)
    ];

    const result = await client.query(queryText, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: `Record with id '${id}' not found.` });
    }

    res.status(200).json({
      message: 'Record updated successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Single Record Update Error:', err);
    res.status(500).json({ message: 'Database error during update.', error: err.message });
  } finally {
    client.release();
  }
});

// DELETE: Delete Single Record by Primary Key ID
router.delete('/retailsalessummary/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  // const { bill_no } = req.query;
  const {id} = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM public.retail_sales_summary WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Record not found.' });
    }

    res.status(200).json({ message: 'Record deleted successfully.', deletedRecord: result.rows[0] });
  } catch (err) {
    console.error('Delete Record Error:', err);
    res.status(500).json({ message: 'Database error while deleting record.', error: err.message });
  }
});

module.exports = router;