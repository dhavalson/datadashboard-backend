// const { z } = require('zod');

// Schema definition matching the product_master table structure
// const productMasterSchema = z.object({
//   body: z.object({
//     product_division: z.string().min(1, 'Product division is required').max(100).trim(),
//     primary_category: z.string().min(1, 'Primary category is required').max(100).trim(),
//     secondary_category: z.string().min(1, 'Secondary category is required').max(100).trim(),
//     display_category: z.string().min(1, 'Display category is required').max(150).trim(),
    
//     // Optional or nullable text fields
//     alternate_category: z.string().max(150).trim().nullable().optional().or(z.literal('')),
    
//     product_code: z
//       .string()
//       .min(1, 'Product code is required')
//       .max(50)
//       .toUpperCase()
//       .trim(),
      
//     product_name: z.string().min(1, 'Product name is required').max(200).trim(),
//     variant: z.string().min(1, 'Variant/Size is required').max(50).trim(),
//     description: z.string().max(500).trim().nullable().optional().or(z.literal('')),
    
//     hsn_code: z
//       .string()
//       .regex(/^\d{4,8}$/, 'HSN Code must be a 4 to 8 digit number')
//       .trim(),
      
//     channel: z.string().min(1, 'Channel is required').max(50).trim(),
//     status: z.enum(['Active', 'Inactive', 'Discontinued']).default('Active'),
    
//     image_id: z.string().max(100).trim().nullable().optional().or(z.literal('')),
    
//     // Units and Packaging
//     standard_unit: z.string().min(1, 'Standard unit is required').max(50).trim(),
//     super_unit: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]).default(1),
//     unit: z.string().min(1, 'Unit is required').max(50).trim(),
    
//     standard_unit_conversion_factor: z
//       .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
//       .pipe(z.number().int().positive())
//       .default(1),
      
//     pack_size: z
//       .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
//       .pipe(z.number().int().positive())
//       .default(1),
      
//     min_buying_qty: z
//       .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
//       .pipe(z.number().int().positive())
//       .default(1),
      
//     max_buying_qty: z
//       .union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)])
//       .nullable()
//       .optional(),
      
//     color_name: z.string().max(50).trim().nullable().optional().or(z.literal('')),
//     rgb_values: z.string().max(50).trim().nullable().optional().or(z.literal('')),
    
//     // Pricing Fields (Supports numeric or numeric strings converted to float)
//     mrp: z
//       .union([z.number().positive('MRP must be positive'), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
//       .refine((val) => val > 0, 'MRP must be greater than 0'),
      
//     display_mrp: z
//       .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
//       .refine((val) => val > 0, 'Display MRP must be greater than 0'),
      
//     ptr: z
//       .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
//       .refine((val) => val > 0, 'PTR must be greater than 0'),
      
//     ptd: z
//       .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
//       .refine((val) => val > 0, 'PTD must be greater than 0'),
//   })
// });

// E:\React js\RBAC App_2\backend\middleware\validateProductMaster.js

const { z } = require('zod');
// 1. Single Product Core Schema (Extracted)
const singleProductSchema = z.object({
  product_division: z.string().min(1, 'Product division is required').max(100).trim(),
  primary_category: z.string().min(1, 'Primary category is required').max(100).trim(),
  secondary_category: z.string().min(1, 'Secondary category is required').max(100).trim(),
  display_category: z.string().min(1, 'Display category is required').max(150).trim(),

  alternate_category: z.string().max(150).trim().nullable().optional().or(z.literal('')),

  product_code: z
    .string()
    .min(1, 'Product code is required')
    .max(50)
    .toUpperCase()
    .trim(),

  product_name: z.string().min(1, 'Product name is required').max(200).trim(),
  variant: z.string().min(1, 'Variant/Size is required').max(50).trim(),
  description: z.string().max(500).trim().nullable().optional().or(z.literal('')),

  hsn_code: z
    .string()
    .regex(/^\d{4,8}$/, 'HSN Code must be a 4 to 8 digit number')
    .trim(),

  channel: z.string().min(1, 'Channel is required').max(50).trim(),
  status: z.enum(['Active', 'Inactive', 'Discontinued']).default('Active'),
  product_range: z.string().min(1, 'Product Range is required').max(10).trim(),

  image_id: z.string().max(100).trim().nullable().optional().or(z.literal('')),

  // Units and Packaging
  standard_unit: z.string().min(1, 'Standard unit is required').max(50).trim(),
  
  super_unit: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? 1 : val),
    z.coerce.number().int().positive().default(1)
  ),
  
  unit: z.string().min(1, 'Unit is required').max(50).trim(),

  standard_unit_conversion_factor: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? 1 : val),
    z.coerce.number().int().positive().default(1)
  ),

  pack_size: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? 1 : val),
    z.coerce.number().int().positive().default(1)
  ),

  min_buying_qty: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? 1 : val),
    z.coerce.number().int().positive().default(1)
  ),

  max_buying_qty: z.preprocess(
    (val) => (val === '' || val === undefined ? null : val),
    z.coerce.number().int().positive().nullable().optional()
  ),

  color_name: z.string().max(50).trim().nullable().optional().or(z.literal('')),
  rgb_values: z.string().max(50).trim().nullable().optional().or(z.literal('')),

  // Pricing Fields
  mrp: z.coerce.number().gt(0, 'MRP must be greater than 0'),
  display_mrp: z.coerce.number().gt(0, 'Display MRP must be greater than 0'),
  ptr: z.coerce.number().gt(0, 'PTR must be greater than 0'),
  ptd: z.coerce.number().gt(0, 'PTD must be greater than 0'),
});

// 2. Single Product Middleware Schema
const productMasterSchema = z.object({
  body: singleProductSchema
});

// 3. Bulk Upload Array Schema
const bulkProductMasterSchema = z.object({
  body: z.array(singleProductSchema).min(1, 'Upload array cannot be empty')
});

// Middleware function to apply in Express routes
const validateProductMaster = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
    });
    // Replace req.body with sanitized and casted data
    req.body = parsed.body;
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
        const issueList = err.issues || err.errors || [];
      return res.status(400).json({
        success: false,
        message: 'Validation error in product payload',
        errors: issueList.map((e) => ({
          field: e.path.join('.').replace('body.', ''),
          message: e.message,
        })),
      });
    }
    next(err);
  }
};

module.exports = {
  productMasterSchema,
  bulkProductMasterSchema,
  validateProductMaster,
};