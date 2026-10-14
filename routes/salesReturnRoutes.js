const express = require('express');
const pool = require('../db');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper functions for data sanitization
const sanitizeDate = (dateVal) => {
    if (!dateVal || String(dateVal).trim() === '' || dateVal === '-' || dateVal === 'N/A') return null;
    return dateVal;
};

const sanitizeNumber = (numVal) => {
    if (numVal === null || numVal === undefined || String(numVal).trim() === '' || numVal === '-') return 0;
    const cleanNum = String(numVal).replace(/,/g, '').trim();
    const parsed = parseFloat(cleanNum);
    return isNaN(parsed) ? 0 : parsed;
};

// GET: Fetch all records
// router.get('/', verifyToken, async (req, res) => {
//     try {
//         const query = 'SELECT * FROM public.sales_return ORDER BY invoice_date DESC NULLS LAST';
//         const result = await pool.query(query);
//         res.json(result.rows);
//     } catch (err) {
//         console.error('FETCH ERROR:', err);
//         res.status(500).json({ message: 'Server error' });
//     }
// });

// GET: Fetch all records with Zone and Territory from distributor_master
router.get('/salesreturn', verifyToken, async (req, res) => {
    try {
        const { role, zone, territory } = req.user;

        let baseQuery = `
            SELECT 
                sr.*,
                dm.zone,
                dm.territory
            FROM public.sales_return sr
            LEFT JOIN public.distributor_master dm 
                ON UPPER(TRIM(sr.gst_no)) = UPPER(TRIM(dm.gst_no))
        `;

        const conditions = [];
        const params = [];

        if (role === 'employee') {
            params.push(zone);
            conditions.push(`dm.zone = $${params.length}`);
        } else if (role === 'user') {
            params.push(territory);
            conditions.push(`dm.territory = $${params.length}`);
        }

        // Build WHERE clause dynamically if filters exist
        if (conditions.length > 0) {
            baseQuery += ` WHERE ${conditions.join(' AND ')}`;
        }

        // Apply single ORDER BY at the very end
        baseQuery += ' ORDER BY sr.invoice_date DESC NULLS LAST';

        const result = await pool.query(baseQuery, params);
        res.json(result.rows);
    } catch (err) {
        console.error('FETCH ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST: Bulk Upload Excel Records
router.post('/salesreturn/bulk', verifyToken, authorizeRoles('admin'), async (req, res) => {
    const records = req.body;

    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ message: 'Invalid or empty record set.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const queryText = `
            INSERT INTO public.sales_return (
                particular, gst_no, invoice_date, month, taxable_amt, 
                tax_amt, total_amt, cn_no, no_of_pcs, nature, 
                category, narration
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            );
        `;

        for (const item of records) {
            const cn_no = item.cn_no || item["CN NO"] || item["CN NO."] || null;
            if (!cn_no) continue; // Skip rows missing CN NO

            const values = [
                item.particular || item["PARTICULAR"] || null,
                item.gst_no || item["GST NO."] || null,
                sanitizeDate(item.invoice_date || item.date || item["DATE"]),
                item.month || item["MONTH"] || null,
                sanitizeNumber(item.taxable_amt || item["TAXABLE VALUE"]),
                sanitizeNumber(item.tax_amt || item["TAX AMT"]),
                sanitizeNumber(item.total_amt || item["TOTAL AMT"]),
                cn_no,
                sanitizeNumber(item.no_of_pcs || item["SINGLE PCS"]),
                item.nature || item["NATURE"] || null,
                item.category || item["CATEGORY"] || null,
                item.narration || item.remark || item["NARRATION"] || null
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

// PUT: Bulk Upsert (Update on Conflict by cn_no)
router.put('/salesreturn/bulk', verifyToken, authorizeRoles('admin'),async (req, res) => {
    const records = req.body;

    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ message: 'Invalid or empty record set.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const queryText = `
            INSERT INTO public.sales_return (
                particular, gst_no, invoice_date, month, taxable_amt,
                tax_amt, total_amt, cn_no, no_of_pcs, nature,
                category, narration
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            )
            ON CONFLICT (cn_no) DO UPDATE SET
                particular = EXCLUDED.particular,
                gst_no = EXCLUDED.gst_no,
                invoice_date = EXCLUDED.invoice_date,
                month = EXCLUDED.month,
                taxable_amt = EXCLUDED.taxable_amt,
                tax_amt = EXCLUDED.tax_amt,
                total_amt = EXCLUDED.total_amt,
                no_of_pcs = EXCLUDED.no_of_pcs,
                nature = EXCLUDED.nature,
                category = EXCLUDED.category,
                narration = EXCLUDED.narration;
        `;

        for (const item of records) {
            const cn_no = item.cn_no || item["CN NO"] || item["CN NO."] || null;
            if (!cn_no) continue;

            const values = [
                item.particular || item["PARTICULAR"] || null,
                item.gst_no || item["GST NO."] || null,
                sanitizeDate(item.invoice_date || item.date || item["DATE"]),
                item.month || item["MONTH"] || null,
                sanitizeNumber(item.taxable_amt || item["TAXABLE VALUE"]),
                sanitizeNumber(item.tax_amt || item["TAX AMT"]),
                sanitizeNumber(item.total_amt || item["TOTAL AMT"]),
                cn_no,
                sanitizeNumber(item.no_of_pcs || item["SINGLE PCS"]),
                item.nature || item["NATURE"] || null,
                item.category || item["CATEGORY"] || null,
                item.narration || item.remark || item["NARRATION"] || null
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

// PUT: Single Record Update by cn_no
router.put('/salesreturn/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
    // const cn_no = decodeURIComponent(req.params.cn_no);
    const item = req.body;
     const { id } = req.params;

    // if (!cn_no) {
    //     return res.status(400).json({ message: 'CN number parameter is required.' });
    // }

    if (!id) {
        return res.status(400).json({ message: 'Id parameter is required.' });
    }

    try {
        const queryText = `
            UPDATE public.sales_return
            SET
                particular = $1,
                gst_no = $2,
                invoice_date = $3,
                month = $4,
                taxable_amt = $5,
                tax_amt = $6,
                total_amt = $7,
                no_of_pcs = $8,
                nature = $9,
                category = $10,
                narration = $11,
                cn_no = $12
            WHERE id = $13
            RETURNING *;
        `;

        const values = [
            item.particular || item["PARTICULAR"] || null,
            item.gst_no || item["GST NO."] || null,
            sanitizeDate(item.invoice_date || item.date || item["DATE"]),
            item.month || item["MONTH"] || null,
            sanitizeNumber(item.taxable_amt || item["TAXABLE VALUE"]),
            sanitizeNumber(item.tax_amt || item["TAX AMT"]),
            sanitizeNumber(item.total_amt || item["TOTAL AMT"]),
            sanitizeNumber(item.no_of_pcs || item["SINGLE PCS"]),
            item.nature || item["NATURE"] || null,
            item.category || item["CATEGORY"] || null,
            item.narration || item.remark || item["NARRATION"] || null,
            item.cn_no || null,
            id
        ];

        const result = await pool.query(queryText, values);

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
    }
});

// DELETE: Delete Single Record by cn_no
router.delete('/salesreturn/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ message: 'Id query parameter is required.' });
    }

    try {
        const result = await pool.query(
            'DELETE FROM public.sales_return WHERE id = $1 RETURNING *',
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