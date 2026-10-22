const { Pool } = require('pg');
// require('dotenv').config();

// Automatically enable SSL only when deployed in production (Render/Neon)
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  // ssl: {
  //   rejectUnauthorized: false // This bypasses self-signed certificate issues on cloud hosts
  // }
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

module.exports = pool;