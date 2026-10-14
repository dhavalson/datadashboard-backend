const express = require('express');
const router = express.Router();
const pool = require('../db'); // Adjust path to your PostgreSQL connection pool
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// GET /api/primaryorders/primaryorders -> Fetch all primary orders
// ---------------------------------------------------------------------------
router.get('/primaryorders', verifyToken, async (req, res) => {
  try {
    const { role, zone, territory } = req.user;

    let query = `
      SELECT 
        po.*,
        pm.product_range,
        dm.territory,
        dm.zone
      FROM primary_orders po
      LEFT JOIN distributor_master dm 
        ON po.distributor_code = dm.distributor_code
      LEFT JOIN product_master pm
        ON po.product_code = pm.product_code
    `;

    let params = [];

    if (role === 'employee') {
      // Filter strictly by distributor zone
      query += ' WHERE dm.zone = $1';
      params.push(zone);
    } else if (role === 'user') {
      // Filter strictly by distributor territory
      query += ' WHERE dm.territory = $1';
      params.push(territory);
    }

    // Always append sorting at the end
    query += ' ORDER BY po.order_date DESC, po.order_time DESC';

    // Pass the params array as the second argument
    const result = await pool.query(query, params);

    res.status(200).json({ 
      success: true, 
      count: result.rows.length, 
      data: result.rows 
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching orders', 
      error: err.message 
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/primaryorders/primaryorders/summary -> Fetch single order item by ID or group by order_no
// ---------------------------------------------------------------------------
router.get('/primaryorders/summary', verifyToken, async (req, res) => {
    try {
        const { role, zone, territory } = req.user;

        // Base query structure
        let baseQuery = `
      SELECT 
        po.order_no,
        po.order_date,  
        dm.distributor_name,
        po.distributor_code,
        dm.territory,
        dm.zone,
        SUM(po.qty) AS total_qty,
        SUM(po.total_value) AS total_amount,
        po.order_time
        
      FROM primary_orders po
      LEFT JOIN distributor_master dm 
        ON po.distributor_code = dm.distributor_code
    `;

        let whereConditions = [];
        let params = [];

        // Apply role-based filtration BEFORE GROUP BY
        if (role === 'employee') {
            whereConditions.push('dm.zone = $1');
            params.push(zone);
        } else if (role === 'user') {
            whereConditions.push('dm.territory = $1');
            params.push(territory);
        }
        // Admin sees all, so no conditions are pushed

        let whereClause = whereConditions.length > 0
            ? ` WHERE ${whereConditions.join(' AND ')}`
            : '';

        let groupByClause = `
      GROUP BY 
        po.order_no, 
        po.order_date, 
        dm.distributor_name, 
        po.distributor_code, 
        dm.territory,
        dm.zone,
        po.order_time
      ORDER BY po.order_date DESC, po.order_time DESC
    `;

        const finalQuery = baseQuery + whereClause + groupByClause;

        // Pass the params array to pool.query
        const { rows } = await pool.query(finalQuery, params);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching primary orders summary:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve order summary.'
        });
    }
});


// ---------------------------------------------------------------------------
// GET /api/primaryorders/primaryorders/:id -> Fetch single order item by ID or group by order_no
// ---------------------------------------------------------------------------
router.get('/primaryorders/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { by_order_no } = req.query;

        // If query param ?by_order_no=true is present, fetch all line items sharing that order_no
        let query, params;
        if (by_order_no === 'true') {
            query = 'SELECT * FROM public.primary_orders WHERE order_no = $1 ORDER BY id ASC';
            params = [id];
        } else {
            query = 'SELECT * FROM public.primary_orders WHERE id = $1';
            params = [id];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order record(s) not found' });
        }

        res.status(200).json({ success: true, data: by_order_no === 'true' ? result.rows : result.rows[0] });
    } catch (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ success: false, message: 'Server error fetching order', error: err.message });
    }
});


// ---------------------------------------------------------------------------
// POST /api/primaryorders/primaryorders -> Create single line-item order
// ---------------------------------------------------------------------------
router.post('/primaryorders', async (req, res) => {
    try {
        const {
            order_no, order_date, order_time, distributor_code, distributor_name,
            primary_category, secondary_category, display_category, product_name,
            product_code, variant, colour, alternate_category, qty, qty_pcs, qty_boxes,
            std_unit_conversion_factor, std_unit, mrp, ptd, ptr,
            cgst, sgst, igst, total_value
        } = req.body;

        if (!order_no || !distributor_code) {
            return res.status(400).json({ success: false, message: 'order_no and distributor_code are required' });
        }

        const query = `
            INSERT INTO public.primary_orders (
                order_no,  order_date, order_time, distributor_code, distributor_name,
                primary_category, secondary_category, display_category, product_name,
                product_code, variant,   colour, alternate_category, qty, qty_pcs, qty_boxes,
                std_unit_conversion_factor, std_unit, mrp, ptd, ptr,
                cgst, sgst, igst, total_value
            ) VALUES (
                $1, COALESCE($2, CURRENT_DATE), COALESCE($3, CURRENT_TIME), $4,
                $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23, $24, $25
            ) RETURNING *;
        `;

        const values = [
            order_no, order_date, order_time, distributor_code, distributor_name,
            primary_category, secondary_category, display_category, product_name,
            product_code, variant, colour, alternate_category, qty, qty_pcs, qty_boxes,
            std_unit_conversion_factor, std_unit, mrp, ptd, ptr,
            cgst || 0, sgst || 0, igst || 0, total_value
        ];

        const result = await pool.query(query, values);
        res.status(201).json({ success: true, message: 'Order item created successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ success: false, message: 'Server error creating order', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/primaryorders/primaryorders/bulk -> Bulk Save Multi-Item Order Batch
// ---------------------------------------------------------------------------
router.post('/primaryorders/bulk', async (req, res) => {
    const client = await pool.connect();
    try {
        const orderItems = req.body; // Array of items sharing the same order_no
        if (!Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Payload must be a non-empty array of order items'
            });
        }

        // 1. Get next atomic counter from PostgreSQL sequence (Increments once per POST request)
        const seqResult = await client.query("SELECT nextval('primary_order_seq') AS seq");
        const nextCounter = seqResult.rows[0].seq;

        // 2. Format order_no (e.g., XYPO + WEST_01 + 00001)
        const distributorPart = orderItems.distributor_code ? String(orderItems.distributor_code).slice(5) : '';
        const order_no = `XYPO/${distributorPart}${String(nextCounter).padStart(5, '0')}`;

        await client.query('BEGIN');

        const query = `
            INSERT INTO public.primary_orders (
                order_no,  order_date, order_time, distributor_code, distributor_name,
                primary_category, secondary_category, display_category, product_name,
                product_code, variant, colour, alternate_category, qty, std_unit, qty_pcs, qty_boxes,
                std_unit_conversion_factor, mrp, ptd, ptr, 
                cgst, sgst, igst, total_value
            ) VALUES (
                $1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, 
                (NOW() AT TIME ZONE 'Asia/Kolkata')::time(0), $2,
                $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23
            ) RETURNING *;
        `;

        const insertedItems = [];
        for (const item of orderItems) {
            const values = [
                order_no,

                // item.order_date || null,
                // item.order_time || null,
                item.distributor_code,
                item.distributor_name,
                item.primary_category,
                item.secondary_category,
                item.display_category,
                item.product_name,
                item.product_code,
                item.variant,
                // item.product_attribute_text1 || null,
                // item.product_attribute_text2 || null,
                item.colour || null,
                item.alternate_category || null,
                item.qty,
                item.std_unit || 'Box',
                item.qty_pcs,
                item.qty_boxes,
                item.std_unit_conversion_factor || 1,
                item.mrp,
                item.ptd,
                item.ptr || item.ptd,
                // item.taxable_value || (item.ptd * item.qty),
                item.cgst || 0,
                item.sgst || 0,
                item.igst || 0,
                item.total_value || (item.ptd * item.qty)
            ];

            const result = await client.query(query, values);
            insertedItems.push(result.rows[0]);
        }

        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            message: `Successfully placed order with ${insertedItems.length} items`,
            data: insertedItems
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error processing bulk order:', err);
        return res.status(500).json({
            success: false,
            message: 'Bulk order creation failed',
            error: err.message
        });
    } finally {
        client.release();
    }
});

// GET /api/primaryorders/next-sequence
// GET /api/primaryorders/next-sequence
router.get('/next-sequence', verifyToken, async (req, res) => {
    try {
        // Query sequence state directly
        const seqResult = await pool.query(`
      SELECT last_value, is_called 
      FROM public.primary_order_seq
    `);

        let nextCount = 1;

        if (seqResult.rows.length > 0) {
            const { last_value, is_called } = seqResult.rows[0];
            // If sequence has been called before, next is last_value + 1. Otherwise, it starts at last_value.
            nextCount = is_called ? parseInt(last_value, 10) + 1 : parseInt(last_value, 10);
        }

        const paddedCounter = String(nextCount).padStart(5, '0');

        return res.status(200).json({
            success: true,
            nextCounter: nextCount,
            paddedCounter: paddedCounter
        });
    } catch (error) {
        console.error('Error fetching sequence:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch sequence counter',
            error: error.message
        });
    }
});

// ---------------------------------------------------------------------------
// PUT /api/primaryorders/primaryorders/bulk -> Bulk Update Line Items
// ---------------------------------------------------------------------------
router.put('/primaryorders/bulk', async (req, res) => {
    const client = await pool.connect();
    try {
        const orderItems = req.body;
        if (!Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Payload must be a non-empty array of items' });
        }

        await client.query('BEGIN');

        const updatedItems = [];
        for (const item of orderItems) {
            if (!item.id) continue;

            const fields = [];
            const values = [];
            let index = 1;

            for (const [key, value] of Object.entries(item)) {
                if (key !== 'id' && key !== 'taxable_value' && key !== 'created_at') {
                    fields.push(`${key} = $${index}`);
                    values.push(value);
                    index++;
                }
            }

            if (fields.length > 0) {
                values.push(item.id);
                const query = `UPDATE public.primary_orders SET ${fields.join(', ')} WHERE id = $${index} RETURNING *;`;
                const res = await client.query(query, values);
                if (res.rows[0]) updatedItems.push(res.rows[0]);
            }
        }

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: `Updated ${updatedItems.length} items`, data: updatedItems });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in bulk order update:', err);
        res.status(500).json({ success: false, message: 'Bulk update failed', error: err.message });
    } finally {
        client.release();
    }
});

// ---------------------------------------------------------------------------
// PUT /api/primaryorders/primaryorders/:id -> Update single line item by ID
// ---------------------------------------------------------------------------
router.put('/primaryorders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const fields = [];
        const values = [];
        let index = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (key !== 'id' && key !== 'taxable_value' && key !== 'created_at') {
                fields.push(`${key} = $${index}`);
                values.push(value);
                index++;
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields provided for update' });
        }

        values.push(id);
        const query = `UPDATE public.primary_orders SET ${fields.join(', ')} WHERE id = $${index} RETURNING *;`;
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order item not found' });
        }

        res.status(200).json({ success: true, message: 'Order item updated successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error updating order item:', err);
        res.status(500).json({ success: false, message: 'Server error updating order item', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/primaryorders/primaryorders/:id -> Delete line item by ID
// ---------------------------------------------------------------------------
router.delete('/primaryorders/:order_no', async (req, res) => {
    try {
        const { order_no } = req.params;

        const result = await pool.query(
            'DELETE FROM public.primary_orders WHERE order_no = $1 RETURNING *',
            [order_no]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No order items found for the given order number'
            });
        }

        res.status(200).json({
            success: true,
            message: `Successfully deleted ${result.rowCount} item(s) associated with order ${order_no}`,
            deletedCount: result.rowCount,
            data: result.rows
        });
    } catch (err) {
        console.error('Error deleting order:', err);
        res.status(500).json({
            success: false,
            message: 'Server error deleting order items',
            error: err.message
        });
    }
});

module.exports = router;