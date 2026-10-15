<<<<<<< HEAD
const express = require('express');
const router = express.Router();
const pool = require('../db'); // Adjust path to your PostgreSQL connection pool
const { productMasterSchema, bulkProductMasterSchema, validateProductMaster } = require('../middleware/validateProductMaster');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// GET /api/products/productmaster -> Fetch all products
// ---------------------------------------------------------------------------
router.get('/productmaster',verifyToken, async (req, res) => {
    try {
        const { role, zone, territory } = req.user;
        // if(role === 'admin'){
        const result = await pool.query(
            'SELECT * FROM public.product_master ORDER BY display_category ASC'
        );
        res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
        // }else{
            // res.status(200).json({ success: false, message: 'Only admin can change the Product data', error: err.message });
        // }
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ success: false, message: 'Server error fetching products', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/products/productmaster/:id -> Fetch product by product_code or numeric id
// ---------------------------------------------------------------------------
router.get('/productmaster/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Check if param is numeric ID or string product_code
        const isNumeric = /^\d+$/.test(id);
        const query = isNumeric 
            ? 'SELECT * FROM public.product_master WHERE id = $1' 
            : 'SELECT * FROM public.product_master WHERE product_code = $1';

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).json({ success: false, message: 'Server error fetching product', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/products/productmaster -> Create a single product
// ---------------------------------------------------------------------------
router.put('/productmaster/bulk', validateProductMaster(bulkProductMasterSchema), verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const products = req.body; // Expects array of product objects
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payload must be a non-empty array of products',
      });
    }

    await client.query('BEGIN');

    // 1. Build values array dynamically with safe numerical extraction
    const valueTuples = [];
    const flatValues = [];
    let paramIndex = 1;

    const parseNum = (val) => (val !== null && val !== undefined && val !== '' ? parseFloat(val) : null);
    const parseIntNum = (val) => (val !== null && val !== undefined && val !== '' ? parseInt(val, 10) : null);

    for (const item of products) {
      const rowParams = [
        item.product_division || null,
        item.primary_category || null,
        item.standard_unit || null,
        parseIntNum(item.super_unit) || 1,
        item.secondary_category || null,
        item.display_category || null,
        item.product_name || null,
        item.variant || null,
        parseNum(item.ptr),
        parseNum(item.ptd),
        parseNum(item.display_mrp),
        parseNum(item.mrp),
        item.unit || null,
        item.alternate_category || null,
        item.description || null,
        parseNum(item.standard_unit_conversion_factor) || 1,
        parseIntNum(item.min_buying_qty) || 1,
        parseIntNum(item.max_buying_qty),
        parseIntNum(item.pack_size) || 1,
        item.color_name || null,
        item.rgb_values || null,
        item.image_id || null,
        item.channel || null,
        item.hsn_code || null,
        item.product_code || null,
        item.status || 'Active',
        item.product_range || item.range || null
      ];

      const placeholders = rowParams
        .map(() => `$${paramIndex++}`)
        .join(', ');

      valueTuples.push(`(${placeholders})`);
      flatValues.push(...rowParams);
    }

    // 2. Dynamic SQL statement with corrected column references
    const query = `
      INSERT INTO public.product_master (
        product_division, primary_category, standard_unit, super_unit,
        secondary_category, display_category, product_name, variant,
        ptr, ptd, display_mrp, mrp, unit, alternate_category, description,
        standard_unit_conversion_factor, min_buying_qty, max_buying_qty,
        pack_size, color_name, rgb_values, image_id, channel, hsn_code,
        product_code, status, product_range
      ) VALUES ${valueTuples.join(', ')}
      ON CONFLICT (product_code) DO UPDATE SET
        product_division = EXCLUDED.product_division,
        primary_category = EXCLUDED.primary_category,
        secondary_category = EXCLUDED.secondary_category,
        display_category = EXCLUDED.display_category, -- 👈 Fixed dot syntax error
        product_name = EXCLUDED.product_name,
        variant = EXCLUDED.variant,
        ptr = EXCLUDED.ptr,
        ptd = EXCLUDED.ptd,
        mrp = EXCLUDED.mrp,
        display_mrp = EXCLUDED.display_mrp,
        unit = EXCLUDED.unit,
        standard_unit = EXCLUDED.standard_unit,
        super_unit = EXCLUDED.super_unit,
        alternate_category = EXCLUDED.alternate_category,
        description = EXCLUDED.description,
        standard_unit_conversion_factor = EXCLUDED.standard_unit_conversion_factor,
        min_buying_qty = EXCLUDED.min_buying_qty,
        max_buying_qty = EXCLUDED.max_buying_qty,
        pack_size = EXCLUDED.pack_size,
        color_name = EXCLUDED.color_name,
        rgb_values = EXCLUDED.rgb_values,
        image_id = EXCLUDED.image_id,
        channel = EXCLUDED.channel,
        hsn_code = EXCLUDED.hsn_code,
        status = EXCLUDED.status,
        product_range = EXCLUDED.product_range,
        updated_at = CURRENT_TIMESTAMP        
      RETURNING id, product_code;
    `;

    const result = await client.query(query, flatValues);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Successfully upserted ${result.rows.length} products`,
      data: result.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in bulk product upsert:', err);
    return res.status(500).json({
      success: false,
      message: 'Bulk upsert failed',
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/products/productmaster/bulk -> Bulk Upsert / Update Products
// ---------------------------------------------------------------------------
// router.put('/productmaster/bulk', validateProductMaster(bulkProductMasterSchema),verifyToken, authorizeRoles('admin'), async (req, res) => {
//   const client = await pool.connect();
//   try {
//     const products = req.body; // Expects array of product objects
//     if (!Array.isArray(products) || products.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Payload must be a non-empty array of products',
//       });
//     }

//     await client.query('BEGIN');

//     // 1. Build values array dynamically
//     const valueTuples = [];
//     const flatValues = [];
//     let paramIndex = 1;

//     for (const item of products) {
//       const rowParams = [
//         item.product_division || null,
//         item.primary_category || null,
//         item.standard_unit || null,
//         item.super_unit || null,
//         item.secondary_category || null,
//         item.display_category || null,
//         item.product_name || null,
//         item.variant || null,
//         item.ptr ? parseFloat(item.ptr) : null,
//         item.ptd ? parseFloat(item.ptd) : null,
//         item.display_mrp ? parseFloat(item.display_mrp) : null,
//         item.mrp ? parseFloat(item.mrp) : null,
//         item.unit || null,
//         item.alternate_category || null,
//         item.description || null,
//         item.standard_unit_conversion_factor ? parseFloat(item.standard_unit_conversion_factor) : null,
//         item.min_buying_qty ? parseInt(item.min_buying_qty, 10) : null,
//         item.max_buying_qty ? parseInt(item.max_buying_qty, 10) : null,
//         item.pack_size || null,
//         item.color_name || null,
//         item.rgb_values || null,
//         item.image_id || null,
//         item.channel || null,
//         item.hsn_code || null,
//         item.product_code || null,
//         item.status || 'Active',
//       ];

//       // Generate ($1, $2, ..., $26), ($27, $28, ..., $52) placeholders
//       const placeholders = rowParams
//         .map(() => `$${paramIndex++}`)
//         .join(', ');

//       valueTuples.push(`(${placeholders})`);
//       flatValues.push(...rowParams);
//     }

//     // 2. Construct dynamic SQL statement
//     const query = `
//       INSERT INTO public.product_master (
//         product_division, primary_category, standard_unit, super_unit,
//         secondary_category, display_category, product_name, variant,
//         ptr, ptd, display_mrp, mrp, unit, alternate_category, description,
//         standard_unit_conversion_factor, min_buying_qty, max_buying_qty,
//         pack_size, color_name, rgb_values, image_id, channel, hsn_code,
//         product_code, status
//       ) VALUES ${valueTuples.join(', ')}
//       ON CONFLICT (product_code) DO UPDATE SET
//         product_division = EXCLUDED.product_division,
//         primary_category = EXCLUDED.primary_category,
//         secondary_category = EXCLUDED.secondary_category,
//         display_category = EXCLUDED.display_category,
//         product_name = EXCLUDED.product_name,
//         variant = EXCLUDED.variant,
//         ptr = EXCLUDED.ptr,
//         ptd = EXCLUDED.ptd,
//         mrp = EXCLUDED.mrp,
//         display_mrp = EXCLUDED.display_mrp,
//         unit = EXCLUDED.unit,
//         pack_size = EXCLUDED.pack_size,
//         hsn_code = EXCLUDED.hsn_code,
//         status = EXCLUDED.status,
//         updated_at = CURRENT_TIMESTAMP
//       RETURNING id, product_code;
//     `;

//     const result = await client.query(query, flatValues);

//     await client.query('COMMIT');

//     return res.status(200).json({
//       success: true,
//       message: `Successfully upserted ${result.rows.length} products`,
//       data: result.rows,
//     });
//   } catch (err) {
//     await client.query('ROLLBACK');
//     console.error('Error in bulk product upsert:', err);
//     return res.status(500).json({
//       success: false,
//       message: 'Bulk upsert failed',
//       error: err.message,
//     });
//   } finally {
//     client.release();
//   }
// });

// ---------------------------------------------------------------------------
// PUT /api/products/productmaster/:id -> Update single product by product_code or numeric id
// ---------------------------------------------------------------------------
router.put('/productmaster/:id', validateProductMaster(productMasterSchema), verifyToken, authorizeRoles('admin'),async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Dynamically build SET clause based on passed fields
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

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        
        const isNumeric = /^\d+$/.test(id);
        const whereClause = isNumeric ? `WHERE id = $${index}` : `WHERE product_code = $${index}`;
        values.push(id);

        const query = `UPDATE public.product_master SET ${fields.join(', ')} ${whereClause} RETURNING *;`;
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, message: 'Product updated successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ success: false, message: 'Server error updating product', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/products/productmaster/:id -> Delete product by product_code or numeric id
// ---------------------------------------------------------------------------
router.delete('/productmaster/:id', validateProductMaster(productMasterSchema),verifyToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const isNumeric = /^\d+$/.test(id);
        const query = isNumeric 
            ? 'DELETE FROM public.product_master WHERE id = $1 RETURNING *' 
            : 'DELETE FROM public.product_master WHERE product_code = $1 RETURNING *';

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, message: 'Product deleted successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ success: false, message: 'Server error deleting product', error: err.message });
    }
});

=======
const express = require('express');
const router = express.Router();
const pool = require('../db'); // Adjust path to your PostgreSQL connection pool
const { productMasterSchema, bulkProductMasterSchema, validateProductMaster } = require('../middleware/validateProductMaster');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// GET /api/products/productmaster -> Fetch all products
// ---------------------------------------------------------------------------
router.get('/productmaster',verifyToken, async (req, res) => {
    try {
        const { role, zone, territory } = req.user;
        // if(role === 'admin'){
        const result = await pool.query(
            'SELECT * FROM public.product_master ORDER BY display_category ASC'
        );
        res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
        // }else{
            // res.status(200).json({ success: false, message: 'Only admin can change the Product data', error: err.message });
        // }
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ success: false, message: 'Server error fetching products', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/products/productmaster/:id -> Fetch product by product_code or numeric id
// ---------------------------------------------------------------------------
router.get('/productmaster/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Check if param is numeric ID or string product_code
        const isNumeric = /^\d+$/.test(id);
        const query = isNumeric 
            ? 'SELECT * FROM public.product_master WHERE id = $1' 
            : 'SELECT * FROM public.product_master WHERE product_code = $1';

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).json({ success: false, message: 'Server error fetching product', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/products/productmaster -> Create a single product
// ---------------------------------------------------------------------------
router.put('/productmaster/bulk', validateProductMaster(bulkProductMasterSchema), verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const products = req.body; // Expects array of product objects
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payload must be a non-empty array of products',
      });
    }

    await client.query('BEGIN');

    // 1. Build values array dynamically with safe numerical extraction
    const valueTuples = [];
    const flatValues = [];
    let paramIndex = 1;

    const parseNum = (val) => (val !== null && val !== undefined && val !== '' ? parseFloat(val) : null);
    const parseIntNum = (val) => (val !== null && val !== undefined && val !== '' ? parseInt(val, 10) : null);

    for (const item of products) {
      const rowParams = [
        item.product_division || null,
        item.primary_category || null,
        item.standard_unit || null,
        parseIntNum(item.super_unit) || 1,
        item.secondary_category || null,
        item.display_category || null,
        item.product_name || null,
        item.variant || null,
        parseNum(item.ptr),
        parseNum(item.ptd),
        parseNum(item.display_mrp),
        parseNum(item.mrp),
        item.unit || null,
        item.alternate_category || null,
        item.description || null,
        parseNum(item.standard_unit_conversion_factor) || 1,
        parseIntNum(item.min_buying_qty) || 1,
        parseIntNum(item.max_buying_qty),
        parseIntNum(item.pack_size) || 1,
        item.color_name || null,
        item.rgb_values || null,
        item.image_id || null,
        item.channel || null,
        item.hsn_code || null,
        item.product_code || null,
        item.status || 'Active',
        item.product_range || item.range || null
      ];

      const placeholders = rowParams
        .map(() => `$${paramIndex++}`)
        .join(', ');

      valueTuples.push(`(${placeholders})`);
      flatValues.push(...rowParams);
    }

    // 2. Dynamic SQL statement with corrected column references
    const query = `
      INSERT INTO public.product_master (
        product_division, primary_category, standard_unit, super_unit,
        secondary_category, display_category, product_name, variant,
        ptr, ptd, display_mrp, mrp, unit, alternate_category, description,
        standard_unit_conversion_factor, min_buying_qty, max_buying_qty,
        pack_size, color_name, rgb_values, image_id, channel, hsn_code,
        product_code, status, product_range
      ) VALUES ${valueTuples.join(', ')}
      ON CONFLICT (product_code) DO UPDATE SET
        product_division = EXCLUDED.product_division,
        primary_category = EXCLUDED.primary_category,
        secondary_category = EXCLUDED.secondary_category,
        display_category = EXCLUDED.display_category, -- 👈 Fixed dot syntax error
        product_name = EXCLUDED.product_name,
        variant = EXCLUDED.variant,
        ptr = EXCLUDED.ptr,
        ptd = EXCLUDED.ptd,
        mrp = EXCLUDED.mrp,
        display_mrp = EXCLUDED.display_mrp,
        unit = EXCLUDED.unit,
        standard_unit = EXCLUDED.standard_unit,
        super_unit = EXCLUDED.super_unit,
        alternate_category = EXCLUDED.alternate_category,
        description = EXCLUDED.description,
        standard_unit_conversion_factor = EXCLUDED.standard_unit_conversion_factor,
        min_buying_qty = EXCLUDED.min_buying_qty,
        max_buying_qty = EXCLUDED.max_buying_qty,
        pack_size = EXCLUDED.pack_size,
        color_name = EXCLUDED.color_name,
        rgb_values = EXCLUDED.rgb_values,
        image_id = EXCLUDED.image_id,
        channel = EXCLUDED.channel,
        hsn_code = EXCLUDED.hsn_code,
        status = EXCLUDED.status,
        product_range = EXCLUDED.product_range,
        updated_at = CURRENT_TIMESTAMP        
      RETURNING id, product_code;
    `;

    const result = await client.query(query, flatValues);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Successfully upserted ${result.rows.length} products`,
      data: result.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in bulk product upsert:', err);
    return res.status(500).json({
      success: false,
      message: 'Bulk upsert failed',
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/products/productmaster/bulk -> Bulk Upsert / Update Products
// ---------------------------------------------------------------------------
// router.put('/productmaster/bulk', validateProductMaster(bulkProductMasterSchema),verifyToken, authorizeRoles('admin'), async (req, res) => {
//   const client = await pool.connect();
//   try {
//     const products = req.body; // Expects array of product objects
//     if (!Array.isArray(products) || products.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Payload must be a non-empty array of products',
//       });
//     }

//     await client.query('BEGIN');

//     // 1. Build values array dynamically
//     const valueTuples = [];
//     const flatValues = [];
//     let paramIndex = 1;

//     for (const item of products) {
//       const rowParams = [
//         item.product_division || null,
//         item.primary_category || null,
//         item.standard_unit || null,
//         item.super_unit || null,
//         item.secondary_category || null,
//         item.display_category || null,
//         item.product_name || null,
//         item.variant || null,
//         item.ptr ? parseFloat(item.ptr) : null,
//         item.ptd ? parseFloat(item.ptd) : null,
//         item.display_mrp ? parseFloat(item.display_mrp) : null,
//         item.mrp ? parseFloat(item.mrp) : null,
//         item.unit || null,
//         item.alternate_category || null,
//         item.description || null,
//         item.standard_unit_conversion_factor ? parseFloat(item.standard_unit_conversion_factor) : null,
//         item.min_buying_qty ? parseInt(item.min_buying_qty, 10) : null,
//         item.max_buying_qty ? parseInt(item.max_buying_qty, 10) : null,
//         item.pack_size || null,
//         item.color_name || null,
//         item.rgb_values || null,
//         item.image_id || null,
//         item.channel || null,
//         item.hsn_code || null,
//         item.product_code || null,
//         item.status || 'Active',
//       ];

//       // Generate ($1, $2, ..., $26), ($27, $28, ..., $52) placeholders
//       const placeholders = rowParams
//         .map(() => `$${paramIndex++}`)
//         .join(', ');

//       valueTuples.push(`(${placeholders})`);
//       flatValues.push(...rowParams);
//     }

//     // 2. Construct dynamic SQL statement
//     const query = `
//       INSERT INTO public.product_master (
//         product_division, primary_category, standard_unit, super_unit,
//         secondary_category, display_category, product_name, variant,
//         ptr, ptd, display_mrp, mrp, unit, alternate_category, description,
//         standard_unit_conversion_factor, min_buying_qty, max_buying_qty,
//         pack_size, color_name, rgb_values, image_id, channel, hsn_code,
//         product_code, status
//       ) VALUES ${valueTuples.join(', ')}
//       ON CONFLICT (product_code) DO UPDATE SET
//         product_division = EXCLUDED.product_division,
//         primary_category = EXCLUDED.primary_category,
//         secondary_category = EXCLUDED.secondary_category,
//         display_category = EXCLUDED.display_category,
//         product_name = EXCLUDED.product_name,
//         variant = EXCLUDED.variant,
//         ptr = EXCLUDED.ptr,
//         ptd = EXCLUDED.ptd,
//         mrp = EXCLUDED.mrp,
//         display_mrp = EXCLUDED.display_mrp,
//         unit = EXCLUDED.unit,
//         pack_size = EXCLUDED.pack_size,
//         hsn_code = EXCLUDED.hsn_code,
//         status = EXCLUDED.status,
//         updated_at = CURRENT_TIMESTAMP
//       RETURNING id, product_code;
//     `;

//     const result = await client.query(query, flatValues);

//     await client.query('COMMIT');

//     return res.status(200).json({
//       success: true,
//       message: `Successfully upserted ${result.rows.length} products`,
//       data: result.rows,
//     });
//   } catch (err) {
//     await client.query('ROLLBACK');
//     console.error('Error in bulk product upsert:', err);
//     return res.status(500).json({
//       success: false,
//       message: 'Bulk upsert failed',
//       error: err.message,
//     });
//   } finally {
//     client.release();
//   }
// });

// ---------------------------------------------------------------------------
// PUT /api/products/productmaster/:id -> Update single product by product_code or numeric id
// ---------------------------------------------------------------------------
router.put('/productmaster/:id', validateProductMaster(productMasterSchema), verifyToken, authorizeRoles('admin'),async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Dynamically build SET clause based on passed fields
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

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        
        const isNumeric = /^\d+$/.test(id);
        const whereClause = isNumeric ? `WHERE id = $${index}` : `WHERE product_code = $${index}`;
        values.push(id);

        const query = `UPDATE public.product_master SET ${fields.join(', ')} ${whereClause} RETURNING *;`;
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, message: 'Product updated successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ success: false, message: 'Server error updating product', error: err.message });
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/products/productmaster/:id -> Delete product by product_code or numeric id
// ---------------------------------------------------------------------------
router.delete('/productmaster/:id', validateProductMaster(productMasterSchema),verifyToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const isNumeric = /^\d+$/.test(id);
        const query = isNumeric 
            ? 'DELETE FROM public.product_master WHERE id = $1 RETURNING *' 
            : 'DELETE FROM public.product_master WHERE product_code = $1 RETURNING *';

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, message: 'Product deleted successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ success: false, message: 'Server error deleting product', error: err.message });
    }
});

>>>>>>> e01807671d9face429f73df0755df27285dd2be7
module.exports = router;