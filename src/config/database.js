/**
 * database.js - MySQL Connection Pool
 * ใช้ mysql2/promise สำหรับ async/await และ Prepared Statements
 * รองรับ SSL สำหรับ Production / Layerbase
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// ตรวจสอบว่าเป็น Production หรือไม่
const isProduction = process.env.NODE_ENV === 'production';

// สร้าง Connection Pool
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'price_compare_db',
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+07:00',

  // ==========================================================
  // SSL สำหรับ Production / Layerbase
  // Local Development จะไม่เปิด SSL
  // ==========================================================
  ...(isProduction && {
    ssl: {
      rejectUnauthorized: false
    }
  })
});

/**
 * ทดสอบการเชื่อมต่อ Database
 * เรียกใช้ตอน Server เริ่มต้น
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();

    console.log('✅ Database connected successfully');

    if (isProduction) {
      console.log('🔐 Database SSL: Enabled');
    } else {
      console.log('🔓 Database SSL: Disabled (Development)');
    }

    connection.release();

  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error(
      '   กรุณาตรวจสอบ DB_HOST, DB_PORT, DB_USER, DB_PASSWORD และ DB_NAME'
    );

    process.exit(1);
  }
}

module.exports = {
  pool,
  testConnection
};