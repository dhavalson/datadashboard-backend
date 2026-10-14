const express = require('express');
const pool = require('../db');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();


router.get('/transport-details', verifyToken, async (req, res) => {
  try {
    const { role, zone, territory } = req.user;

    let query = 'SELECT * FROM public.transport_details';
    let params = [];

    if (role === 'admin') {
      // Admin sees everything
      query += ' ORDER BY order_date DESC';
    } else if (role === 'employee') {
      // Employee sees all entries in their Zone
      query += ' WHERE zone = $1 ORDER BY order_date DESC';
      params.push(zone);
    } else if (role === 'user') {
      // User sees entries in their Territory
      query += ' WHERE territory = $1 ORDER BY order_date DESC';
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
router.post('/transport-details/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Start transaction

    const queryText = `
      INSERT INTO public.transport_details (
        month, order_date, voucher_no, distributor, gst_no, zone, territory,
        no_of_boxes_order, no_of_sent_box, scheme, diff, status, with_cod, remark,
        a_flag, invoice_date, pack_date, dispatch_date, challan_no,
        challan_no_for_invoice, invoice_no, invoice_value, sap_invoice,
        courier_name, lr_no, actual_weight, no_of_cartoons, six_t, lr_amount, delivery_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      );
    `;
    const sanitizeDate = (dateVal) => {
      if (!dateVal || String(dateVal).trim() === '') return null;
      return dateVal;
    };
    for (const item of records) {
      const values = [
        item.month, sanitizeDate(item.order_date), item.voucher_no, item.distributor, item.gst_no,
        item.zone, item.territory, item.no_of_boxes_order, item.no_of_sent_box, item.scheme,
        item.diff, item.status, item.with_cod, item.remark, item.a_flag,
        sanitizeDate(item.invoice_date), sanitizeDate(item.pack_date), sanitizeDate(item.dispatch_date), item.challan_no,
        item.challan_no_for_invoice, item.invoice_no, item.invoice_value, item.sap_invoice,
        item.courier_name, item.lr_no, item.actual_weight, item.no_of_cartoons,
        item.six_t, item.lr_amount, sanitizeDate(item.delivery_date)
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT'); // Commit transaction
    res.status(201).json({ message: 'Bulk insertion successful!' });
  } catch (err) {
    await client.query('ROLLBACK'); // Rollback on failure
    console.error('Bulk Insert Error:', err);
    res.status(500).json({ message: 'Database transaction error during Excel bulk insert.', error: err.message });
  } finally {
    client.release();
  }
});


// PUT: Bulk Update / Upsert based on unique challan_no
router.put('/transport-details/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const records = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty record set.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Start transaction

    const queryText = `
      INSERT INTO public.transport_details (
        month, order_date, voucher_no, distributor, gst_no, zone, territory,
        no_of_boxes_order, no_of_sent_box, scheme, diff, status, with_cod, remark,
        a_flag, invoice_date, pack_date, dispatch_date, challan_no,
        challan_no_for_invoice, invoice_no, invoice_value, sap_invoice,
        courier_name, lr_no, actual_weight, no_of_cartoons, six_t, lr_amount, delivery_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      )
      ON CONFLICT (challan_no) DO UPDATE SET
        month = EXCLUDED.month,
        order_date = EXCLUDED.order_date,
        distributor = EXCLUDED.distributor,
        zone = EXCLUDED.zone,
        territory = EXCLUDED.territory,
        no_of_boxes_order = EXCLUDED.no_of_boxes_order,
        no_of_sent_box = EXCLUDED.no_of_sent_box,
        scheme = EXCLUDED.scheme,
        diff = EXCLUDED.diff,
        status = EXCLUDED.status,
        with_cod = EXCLUDED.with_cod,
        remark = EXCLUDED.remark,
        a_flag = EXCLUDED.a_flag,
        invoice_date = EXCLUDED.invoice_date,
        pack_date = EXCLUDED.pack_date,
        dispatch_date = EXCLUDED.dispatch_date,
        challan_no = EXCLUDED.challan_no,
        challan_no_for_invoice = EXCLUDED.challan_no_for_invoice,
        invoice_value = EXCLUDED.invoice_value,
        sap_invoice = EXCLUDED.sap_invoice,
        courier_name = EXCLUDED.courier_name,
        actual_weight = EXCLUDED.actual_weight,
        no_of_cartoons = EXCLUDED.no_of_cartoons,
        six_t = EXCLUDED.six_t,
        lr_amount = EXCLUDED.lr_amount,
        delivery_date = EXCLUDED.delivery_date;
    `;

    const sanitizeDate = (dateVal) => {
      if (!dateVal || String(dateVal).trim() === '') return null;
      return dateVal;
    };

    for (const item of records) {
      const values = [
        item.month,
        sanitizeDate(item.order_date),
        item.voucher_no || '',
        item.distributor,
        item.gst_no || '',
        item.zone,
        item.territory,
        item.no_of_boxes_order,
        item.no_of_sent_box,
        item.scheme,
        item.diff,
        item.status,
        item.with_cod,
        item.remark,
        item.a_flag,
        sanitizeDate(item.invoice_date),
        sanitizeDate(item.pack_date),
        sanitizeDate(item.dispatch_date),
        item.challan_no,
        item.challan_no_for_invoice,
        item.invoice_no || '',
        item.invoice_value,
        item.sap_invoice,
        item.courier_name,
        item.lr_no || '',
        item.actual_weight,
        item.no_of_cartoons,
        item.six_t,
        item.lr_amount,
        sanitizeDate(item.delivery_date)
      ];

      await client.query(queryText, values);
    }

    await client.query('COMMIT'); // Commit transaction
    res.status(200).json({ message: 'Bulk update based on 4-parameter composite key successful!' });
  } catch (err) {
    await client.query('ROLLBACK'); // Rollback on failure
    console.error('Bulk Update Error:', err);
    res.status(500).json({ message: 'Database error during bulk update.', error: err.message });
  } finally {
    client.release();
  }
});


// PUT route to update a single record by its unique challan_no
router.put('/transport-details/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  // const { challan_no } = req.params;
  // const challan_no = decodeURIComponent(req.params.challan_no);
  const item = req.body;
  const {id} = req.params;


  if (!id) {
    return res.status(400).json({ message: 'Id parameter is required.' });
  }

  const client = await pool.connect();

  try {
    const sanitizeDate = (dateVal) => {
      if (!dateVal || String(dateVal).trim() === '' || dateVal === '-') return null;
      return dateVal;
    };

    const queryText = `
      UPDATE public.transport_details
      SET
        month = $1,
        order_date = $2,
        voucher_no = $3,
        distributor = $4,
        gst_no = $5,
        zone = $6,
        territory = $7,
        no_of_boxes_order = $8,
        no_of_sent_box = $9,
        scheme = $10,
        diff = $11,
        status = $12,
        with_cod = $13,
        remark = $14,
        a_flag = $15,
        invoice_date = $16,
        pack_date = $17,
        dispatch_date = $18,
        challan_no_for_invoice = $19,
        invoice_no = $20,
        invoice_value = $21,
        sap_invoice = $22,
        courier_name = $23,
        lr_no = $24,
        actual_weight = $25,
        no_of_cartoons = $26,
        six_t = $27,
        lr_amount = $28,
        delivery_date = $29,
        challan_no = $30
      WHERE id = $31
      RETURNING *;
    `;

    const values = [
      item.month,
      sanitizeDate(item.order_date),
      item.voucher_no || '',
      item.distributor,
      item.gst_no || '',
      item.zone,
      item.territory,
      item.no_of_boxes_order,
      item.no_of_sent_box,
      item.scheme,
      item.diff,
      item.status,
      item.with_cod,
      item.remark,
      item.a_flag,
      sanitizeDate(item.invoice_date),
      sanitizeDate(item.pack_date),
      sanitizeDate(item.dispatch_date),
      item.challan_no_for_invoice,
      item.invoice_no || '',
      item.invoice_value,
      item.sap_invoice,
      item.courier_name,
      item.lr_no || '',
      item.actual_weight,
      item.no_of_cartoons,
      item.six_t,
      item.lr_amount,
      sanitizeDate(item.delivery_date),
      item.challan_no,
      id // $31 parameter for WHERE clause
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



// DELETE: Delete Single Record by ID
router.delete('/transport-details/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM public.transport_details WHERE id = $1 RETURNING *',
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