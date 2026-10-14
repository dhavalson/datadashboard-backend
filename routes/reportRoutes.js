const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// GET: Fetch Territory-wise Summary Report
router.get('/territory-summary', verifyToken, async (req, res) => {
    try {
        const { role, zone, territory } = req.user;

        // Base CTEs (Common Table Expressions) for clean pre-aggregation
        // let query = `
        //     WITH primary_agg AS (
        //         SELECT 
        //             UPPER(TRIM(gst_no)) AS gst_no,
        //             SUM(taxable_amt) AS total_gross_primary
        //         FROM public.retail_sales_summary
        //         GROUP BY UPPER(TRIM(gst_no))
        //     ),
        //     return_agg AS (
        //         SELECT 
        //             UPPER(TRIM(gst_no)) AS gst_no,
        //             SUM(taxable_amt) AS total_sales_return
        //         FROM public.sales_return
        //         GROUP BY UPPER(TRIM(gst_no))
        //     ),
        //      
        //     SELECT 
        //         dm.territory,
        //         dm.zone,
        //         COALESCE(SUM(pa.total_gross_primary), 0) AS gross_primary,
        //         COALESCE(SUM(ra.total_sales_return), 0) AS sales_return,
        //         (COALESCE(SUM(pa.total_gross_primary), 0) - COALESCE(SUM(ra.total_sales_return), 0)) AS net_primary,
        //      
        //     FROM public.distributor_master dm
        //     LEFT JOIN primary_agg pa ON UPPER(TRIM(dm.gst_no)) = pa.gst_no
        //     LEFT JOIN return_agg ra ON UPPER(TRIM(dm.gst_no)) = ra.gst_no
        //     

        //     WHERE dm.territory IS NOT NULL AND dm.territory != ''
        // `;

        let query = `
            WITH primary_agg AS (
                SELECT 
                    UPPER(TRIM(gst_no)) AS gst_no,
                    SUM(taxable_amt) AS total_gross_primary
                FROM public.retail_sales_summary
                WHERE gst_no IS NOT NULL AND TRIM(gst_no) != ''
                GROUP BY UPPER(TRIM(gst_no))
                ),
                return_agg AS (
                    SELECT 
                        UPPER(TRIM(gst_no)) AS gst_no,
                        SUM(taxable_amt) AS total_sales_return
                    FROM public.sales_return
                    WHERE gst_no IS NOT NULL AND TRIM(gst_no) != ''
                    GROUP BY UPPER(TRIM(gst_no))
                ),
                payment_agg AS (
                    SELECT 
                        UPPER(TRIM(gst_no)) AS gst_no,
                        SUM(amount) AS total_payment
                    FROM public.payment_received
                    WHERE gst_no IS NOT NULL AND TRIM(gst_no) != ''
                    GROUP BY UPPER(TRIM(gst_no))
                )
                SELECT 
                    dm.territory,
                    dm.zone,
                    COALESCE(SUM(pa.total_gross_primary), 0) AS gross_primary,
                    COALESCE(SUM(ra.total_sales_return), 0) AS sales_return,
                    (COALESCE(SUM(pa.total_gross_primary), 0) - COALESCE(SUM(ra.total_sales_return), 0)) AS net_primary,
                    COALESCE(SUM(py.total_payment), 0) AS payment_received
                FROM public.distributor_master dm
                LEFT JOIN primary_agg pa ON UPPER(TRIM(dm.gst_no)) = pa.gst_no
                LEFT JOIN return_agg ra ON UPPER(TRIM(dm.gst_no)) = ra.gst_no
                LEFT JOIN payment_agg py ON UPPER(TRIM(dm.gst_no)) = py.gst_no
                WHERE dm.territory IS NOT NULL AND TRIM(dm.territory) != ''
                GROUP BY dm.territory, dm.zone
        `;

        const params = [];

        // const params = [];
        const conditions = [];

        if (role === 'employee') {
            params.push(zone);
            conditions.push(`dm.zone = $${params.length}`);
        } else if (role === 'user') {
            params.push(territory);
            conditions.push(`dm.territory = $${params.length}`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        // Group by both columns and apply primary order on territory, secondary on zone
        query += ` GROUP BY dm.territory, dm.zone ORDER BY dm.zone ASC, dm.zone ASC;`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('REPORT FETCH ERROR:', err);
        res.status(500).json({ message: 'Error generating territory report.', error: err.message });
    }
});

module.exports = router;