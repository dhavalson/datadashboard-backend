const express = require('express');
const router = express.Router();
const pool = require('../db'); // Adjust path to your PostgreSQL connection pool
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { sendOrderEmailToDistributor } = require('../mailer.js');
const { buildFilterQuery } = require('../utils/filterService')

// ---------------------------------------------------------------------------
// GET /api/primaryorders/primaryorders -> Fetch all primary orders
// ---------------------------------------------------------------------------
router.get('/primaryorders/details', verifyToken, async (req, res) => {
    try {
        const { from_date, to_date, territory: queryTerritory, search_code_name } = req.query;

        let baseQuery = `
      SELECT 
        po.*,
        pm.product_name,
        pm.product_range,
        pm.product_division,
        pm.primary_category,
        pm.secondary_category,
        pm.display_category,
        pm.alternate_category,
        pm.description,
        pm.hsn_code,
        pm.color_name,
        pm.rgb_values,
        pm.variant,
        d.territory,
        d.zone
      FROM primary_orders po
      LEFT JOIN distributor_master d
        ON po.distributor_code = d.distributor_code
      LEFT JOIN product_master pm
        ON po.product_code = pm.product_code
    `;

        // 1. Get role-based where clause and params (starting parameter index at 1)
        let { whereClause, params } = buildFilterQuery(req.user, 1);

        // Ensure conditions array exists to safely push custom filters
        let conditions = whereClause ? [whereClause.replace(/^WHERE\s+/i, '')] : [];
        let paramIndex = params.length + 1;

        // 2. Append From Date filter (DD-MM-YYYY -> YYYY-MM-DD)
        if (from_date) {
            const [d, m, y] = from_date.split('-');
            if (y && m && d) {
                conditions.push(`po.order_date >= $${paramIndex++}`);
                params.push(`${y}-${m}-${d}`);
            }
        }

        // 3. Append To Date filter (DD-MM-YYYY -> YYYY-MM-DD)
        if (to_date) {
            const [d, m, y] = to_date.split('-');
            if (y && m && d) {
                conditions.push(`po.order_date <= $${paramIndex++}`);
                params.push(`${y}-${m}-${d}`);
            }
        }

        // 4. Append UI Territory filter (if selected from dropdown)
        if (queryTerritory) {
            conditions.push(`d.territory = $${paramIndex++}`);
            params.push(queryTerritory);
        }

        // 5. Append Search filter (Document no, codes, or distributor name)
        if (search_code_name) {
            conditions.push(`(po.order_no ILIKE $${paramIndex} OR po.distributor_code ILIKE $${paramIndex} OR d.distributor_name ILIKE $${paramIndex} OR po.product_code ILIKE $${paramIndex})`);
            params.push(`%${search_code_name}%`);
            paramIndex++;
        }

        // Combine all conditions back into a single WHERE clause
        let finalQuery = baseQuery;
        if (conditions.length > 0) {
            finalQuery += ` WHERE ${conditions.join(' AND ')}`;
        }

        // Append sorting at the end
        finalQuery += ' ORDER BY po.order_date DESC, po.order_time DESC';

        const { rows } = await pool.query(finalQuery, params);

        res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
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

// router.get('/primaryorders/summary', verifyToken, async (req, res) => {
//     try {
//         // Base query structure with table aliases
//         let baseQuery = `
//             SELECT 
//                 po.order_no,
//                 po.order_date,  
//                 d.distributor_name,
//                 po.distributor_code,
//                 d.territory,
//                 d.zone,
//                 SUM(po.qty_boxes) AS total_box_qty,
//                 SUM(po.tax_value) AS tax_value,
//                 SUM(po.taxable_value) AS taxable_value,
//                 SUM(po.total_value) AS total_amount,
//                 po.order_time
//             FROM primary_orders po
//             LEFT JOIN distributor_master d 
//                 ON po.distributor_code = d.distributor_code
//         `;

//         // Generate dynamic filters via your centralized service
//         // Note: We alias dm.territory / dm.zone / dm.distributor_code inside buildFilterQuery or handle it seamlessly.
//         // Let's pass req.user to buildFilterQuery starting at parameter index 1
//         const { whereClause, params } = buildFilterQuery(req.user, 1);

//         // If your buildFilterQuery references table 'd' by default, make sure it matches your aliases (po or dm).
//         // Alternatively, you can adapt the whereClause columns to use dm. or po. if needed.

//         let groupByClause = `
//             GROUP BY 
//                 po.order_no, 
//                 po.order_date, 
//                 d.distributor_name, 
//                 po.distributor_code, 
//                 d.territory,
//                 d.zone,
//                 po.order_time
//             ORDER BY po.order_date DESC, po.order_time DESC
//         `;

//         const finalQuery = baseQuery + (whereClause ? ` ${whereClause}` : '') + groupByClause;

//         // console.log('FINAL SUMMARY QUERY:', finalQuery);
//         // console.log('PARAMS:', params);

//         const { rows } = await pool.query(finalQuery, params);

//         return res.status(200).json({
//             success: true,
//             count: rows.length,
//             data: rows
//         });
//     } catch (error) {
//         console.error('Error fetching primary orders summary:', error);
//         return res.status(500).json({
//             success: false,
//             message: 'Failed to retrieve order summary.'
//         });
//     }
// });


router.get('/primaryorders/summary', verifyToken, async (req, res) => {
    try {
        const { from_date, to_date, territory: queryTerritory, search_code_name } = req.query;

        let baseQuery = `
      SELECT 
        po.order_no,
        po.order_date,  
        d.distributor_name,
        po.distributor_code,
        d.territory,
        d.zone,
        SUM(po.qty_boxes) AS total_box_qty,
        SUM(po.tax_value) AS tax_value,
        SUM(po.taxable_value) AS taxable_value,
        SUM(po.total_value) AS total_amount,
        po.order_time
      FROM primary_orders po
      LEFT JOIN distributor_master d 
        ON po.distributor_code = d.distributor_code
    `;

        // 1. Get role-based where clause and params (starting parameter index at 1)
        let { whereClause, params } = buildFilterQuery(req.user, 1);

        // Ensure conditions array exists to safely push custom filters
        let conditions = whereClause ? [whereClause.replace(/^WHERE\s+/i, '')] : [];
        let paramIndex = params.length + 1;

        // 2. Append From Date filter (DD-MM-YYYY -> YYYY-MM-DD)
        if (from_date) {
            const [d, m, y] = from_date.split('-');
            if (y && m && d) {
                conditions.push(`po.order_date >= $${paramIndex++}`);
                params.push(`${y}-${m}-${d}`);
            }
        }

        // 3. Append To Date filter (DD-MM-YYYY -> YYYY-MM-DD)
        if (to_date) {
            const [d, m, y] = to_date.split('-');
            if (y && m && d) {
                conditions.push(`po.order_date <= $${paramIndex++}`);
                params.push(`${y}-${m}-${d}`);
            }
        }

        // 4. Append UI Territory filter (if selected from dropdown)
        if (queryTerritory) {
            conditions.push(`d.territory = $${paramIndex++}`);
            params.push(queryTerritory);
        }

        // 5. Append Search filter (Document no, codes, or distributor name)
        if (search_code_name) {
            conditions.push(
                `(po.order_no ILIKE $${paramIndex} OR po.distributor_code ILIKE $${paramIndex} OR d.distributor_name ILIKE $${paramIndex})`
            );
            params.push(`%${search_code_name}%`);
            paramIndex++;
        }

        // Combine all conditions back into a single WHERE clause before GROUP BY
        let finalQuery = baseQuery;
        if (conditions.length > 0) {
            finalQuery += ` WHERE ${conditions.join(' AND ')}`;
        }

        finalQuery += `
      GROUP BY 
        po.order_no, 
        po.order_date, 
        d.distributor_name, 
        po.distributor_code, 
        d.territory,
        d.zone,
        po.order_time
      ORDER BY po.order_date DESC, po.order_time DESC
    `;

        const { rows } = await pool.query(finalQuery, params);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows,
        });
    } catch (error) {
        console.error('Error fetching primary orders summary:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve order summary.',
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

        // console.log(req.body);


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
// router.post('/primaryorders/bulk', async (req, res) => {
//     const client = await pool.connect();
//     try {
//         const orderItems = req.body; // Array of items sharing the same order_no
//         if (!Array.isArray(orderItems) || orderItems.length === 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Payload must be a non-empty array of order items'
//             });
//         }

//         // 1. Get next atomic counter from PostgreSQL sequence (Increments once per POST request)
//         const seqResult = await client.query("SELECT nextval('primary_order_seq') AS seq");
//         const nextCounter = seqResult.rows[0].seq;

//         // 2. Format order_no (e.g., XYPO + WEST_01 + 00001)
//         const distributorPart = orderItems.distributor_code ? String(orderItems.distributor_code).slice(5) : '';
//         const order_no = `XYPO/${distributorPart}${String(nextCounter).padStart(5, '0')}`;

//         await client.query('BEGIN');

//         // const query = `
//         //     INSERT INTO public.primary_orders (
//         //         order_no,  order_date, order_time, distributor_code, distributor_name,
//         //         primary_category, secondary_category, display_category, product_name,
//         //         product_code, variant, colour, alternate_category, qty, std_unit, qty_pcs, qty_boxes,
//         //         std_unit_conversion_factor, mrp, ptd, ptr, 
//         //         cgst, sgst, igst, gst, tax_value, taxable_value,  total_value
//         //     ) VALUES (
//         //         $1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, 
//         //         (NOW() AT TIME ZONE 'Asia/Kolkata')::time(0), $2,
//         //         $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
//         //         $18, $19, $20, $21, $22, $23, $24, $25, $26
//         //     ) RETURNING *;
//         // `;
//           const query = `
//             INSERT INTO public.primary_orders (
//                 order_no,  order_date, order_time, distributor_code, distributor_name,
//                 product_code, qty, std_unit, qty_pcs, qty_boxes,
//                 std_unit_conversion_factor, mrp, ptd, ptr, 
//                 gst, tax_value, taxable_value,  total_value
//             ) VALUES (
//                 $1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, 
//                 (NOW() AT TIME ZONE 'Asia/Kolkata')::time(0), $2,
//                 $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
//             ) RETURNING *;
//         `;

//         const insertedItems = [];
//         for (const item of orderItems) {
//             const values = [
//                 order_no,

//                 // item.order_date || null,
//                 // item.order_time || null,
//                 item.distributor_code,
//                 item.distributor_name,
//                 // item.primary_category,
//                 // item.secondary_category,
//                 // item.display_category,
//                 // item.product_name,
//                 item.product_code,
//                 // item.variant,
//                 // item.product_attribute_text1 || null,
//                 // item.product_attribute_text2 || null,
//                 // item.colour || null,
//                 // item.alternate_category || null,
//                 item.qty,
//                 item.std_unit,
//                 item.qty_pcs,
//                 item.qty_boxes,
//                 item.std_unit_conversion_factor || 1,
//                 item.mrp,
//                 item.ptd,
//                 item.ptr || item.ptd,
//                 // item.taxable_value || (item.ptd * item.qty),
//                 // item.cgst || 0,
//                 // item.sgst || 0,
//                 // item.igst || 0,
//                 item.gst || 0,
//                 item.tax_value || 0,
//                 item.taxable_value || 0,
//                 item.total_value || (item.ptd * item.qty)
//             ];

//             const result = await client.query(query, values);
//             insertedItems.push(result.rows[0]);
//         }

//         await client.query('COMMIT');

//              // 2. Extract distributor email (assumes your payload or distributor table has an email field)
//         // const distributorEmail = items[0]?.distributor_email; // or fetch from your distributors table
//     //     const distributorEmail = await pool.query(`
//     //   SELECT mail_id 
//     //   FROM public.distributor_master
//     // `);
//     const distributorEmail = 'dhaval@xyxxcrew.com'

//         if (distributorEmail) {
//             // Construct payload summary for email
//             const payloadSummary = {
//                 orderNo: orderItems[0].order_no,
//                 orderDate: orderItems[0].order_date,
//                 orderTime: orderItems[0].order_time,
//                 distributor: orderItems[0].distributor_name,
//                 totalQty: orderItems.reduce((sum, i) => sum + i.qty, 0),
//                 totalAmount: orderItems.reduce((sum, i) => sum + i.total_value, 0),
//                 items: orderItems
//             };

//             // Send mail via Outlook SMTP service asynchronously
//             await sendOrderEmailToDistributor(distributorEmail, payloadSummary);
//         }


//         return res.status(201).json({
//             success: true,
//             message: `Successfully placed order with ${insertedItems.length} items`,
//             data: insertedItems
//         });
//     } catch (err) {
//         await client.query('ROLLBACK');
//         console.error('Error processing bulk order:', err);
//         return res.status(500).json({
//             success: false,
//             message: 'Bulk order creation failed',
//             error: err.message
//         });
//     } finally {
//         client.release();
//     }
// });

router.post('/primaryorders/bulk', async (req, res) => {
    const client = await pool.connect();
    let committed = false;

    try {
        const orderItems = req.body;

        if (!Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Payload must be a non-empty array of order items',
            });
        }

        const seqResult = await client.query("SELECT nextval('primary_order_seq') AS seq");
        const nextCounter = seqResult.rows[0].seq;

        // const firstCode = orderItems[0]?.distributor_code ? String(orderItems[0].distributor_code) : '';
        // const distributorPart = firstCode.slice(5);
        // const order_no = `XYPO/${distributorPart}${String(nextCounter).padStart(5, '0')}`;
        // const order_no = `XYPO/26-27/${String(nextCounter).padStart(5, '0')}`

        await client.query('BEGIN');

        const query = `
      INSERT INTO public.primary_orders (
        order_no, order_date, order_time, distributor_code, distributor_name,
        product_code, qty, std_unit, qty_pcs, qty_boxes,
        std_unit_conversion_factor, mrp, ptd, ptr,
        gst, tax_value, taxable_value, total_value
      ) VALUES (
        $1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
        (NOW() AT TIME ZONE 'Asia/Kolkata')::time(0), $2,
        $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *;
    `;

        const insertedItems = [];
        for (const item of orderItems) {
            const qty = Number(item.qty) || 0;
            const ptd = Number(item.ptd) || 0;
            const totalValue = Number(item.total_value) || 0;

            const values = [
                item.order_no,
                item.distributor_code,
                item.distributor_name,
                item.product_code,
                qty,
                item.std_unit,
                item.qty_pcs,
                item.qty_boxes,
                item.std_unit_conversion_factor || 1,
                item.mrp,
                ptd,
                item.ptr || ptd,
                item.gst || 0,
                item.tax_value || 0,
                item.taxable_value || 0,
                totalValue,
            ];

            const result = await client.query(query, values);
            insertedItems.push(result.rows[0]);
        }

        await client.query('COMMIT');
        committed = true;

        const distributorEmail = 'dhaval@xyxxcrew.com';
        let emailSent = false;

        if (distributorEmail && insertedItems.length > 0) {
            const firstSaved = insertedItems[0];
            const payloadSummary = {
                orderNo: firstSaved.order_no,
                orderDate: new Date(firstSaved.order_date).toDateString(),
                orderTime: String(firstSaved.order_time).split('.')[0],
                distributorName: firstSaved.distributor_name,
                totalQty: insertedItems.reduce((sum, i) => sum + (Number(i.qty) || 0), 0),
                // taxableValue: insertedItems.reduce((sum, i) => sum + (Number(i.taxable_value) || 0), 0),
                // totalAmount: insertedItems.reduce((sum, i) => sum + (Number(i.total_value) || 0), 0),
                taxableValue: Number(
                    insertedItems.reduce((sum, i) => sum + (Number(i.taxable_value) || 0), 0).toFixed(2)
                ),
                totalAmount: Number(
                    insertedItems.reduce((sum, i) => sum + (Number(i.total_value) || 0), 0).toFixed(2)
                ),
                items: orderItems,
            };

            try {
                // console.log('Before sendMail -> to:', distributorEmail, 'orderNo:', payloadSummary.orderNo, orderItems);
                await sendOrderEmailToDistributor(distributorEmail, payloadSummary);
                emailSent = true;
            } catch (emailErr) {
                console.error('Order saved, but failed to send email:', emailErr);
            }
        }

        return res.status(201).json({
            success: true,
            emailSent,
            message: `Successfully placed order with ${insertedItems.length} items`,
            data: insertedItems,
        });
    } catch (err) {
        if (!committed) {
            await client.query('ROLLBACK');
        }
        console.error('Error processing bulk order:', err);
        return res.status(500).json({
            success: false,
            message: 'Bulk order creation failed',
            error: err.message,
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
        log(orderItems)
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
            if (key !== 'id' && key !== 'created_at') {
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
// DELETE /api/primaryorders/primaryorders/:id -> Delete complete order by order number
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


// ---------------------------------------------------------------------------
// DELETE /api/primaryorders/primaryorders/:id -> Delete line item by ID
// ---------------------------------------------------------------------------
router.delete('/primaryorders/by_id/:id', async (req, res) => {
    try {
        const { id, order_no, product_code } = req.params;
        // console.log(req.params);


        const result = await pool.query(
            'DELETE FROM public.primary_orders WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No data found for the given id'
            });
        }

        res.status(200).json({
            success: true,
            message: `Successfully deleted ${result.rowCount} item(s) associated with line id ${id}`,
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

router.put('/primaryorders/:order_no', verifyToken, async (req, res) => {
    const { order_no } = req.params;
    const {
        order_date,
        order_time,
        distributor_code,
        qty,
        std_unit,
        qty_pcs,
        qty_boxes,
        std_unit_conversion_factor,
        mrp,
        ptd,
        ptr,
        taxable_value,
        total_value,
        gst,
        tax_value
    } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const updateQuery = `
      UPDATE public.primary_orders
      SET 
        order_date = COALESCE($1, order_date),
        order_time = COALESCE($2, order_time),
        distributor_code = COALESCE($3, distributor_code),
        qty = COALESCE($4, qty),
        std_unit = COALESCE($5, std_unit),
        qty_pcs = COALESCE($6, qty_pcs),
        qty_boxes = COALESCE($7, qty_boxes),
        std_unit_conversion_factor = COALESCE($8, std_unit_conversion_factor),
        mrp = COALESCE($9, mrp),
        ptd = COALESCE($10, ptd),
        ptr = COALESCE($11, ptr),
        taxable_value = COALESCE($12, taxable_value),
        total_value = COALESCE($13, total_value),
        gst = COALESCE($14, gst),
        tax_value = COALESCE($15, tax_value)
      WHERE order_no = $16
    `;

        const values = [
            order_date || null,
            order_time || null,
            distributor_code || null,
            qty || null,
            std_unit || null,
            qty_pcs || null,
            qty_boxes || null,
            std_unit_conversion_factor || null,
            mrp || null,
            ptd || null,
            ptr || null,
            taxable_value || null,
            total_value || null,
            gst || null,
            tax_value || null,
            order_no
        ];

        const result = await client.query(updateQuery, values);

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        await client.query('COMMIT');
        return res.status(200).json({
            success: true,
            message: `Order ${order_no} updated successfully!`
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating order:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while updating order.',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// Backend route to fetch all rows belonging to a specific order number
router.get('/primaryorders/details/:order_no', verifyToken, async (req, res) => {
    const { order_no } = req.params;
    try {
        const query = `
      SELECT * FROM primary_orders 
      WHERE order_no = $1
    `;
        const { rows } = await pool.query(query, [order_no]);

        res.status(200).json({
            success: true,
            order_no,
            items: rows
        });
    } catch (err) {
        console.error('Error fetching order details:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;