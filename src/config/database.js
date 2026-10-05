/**
 * database.js - MySQL Connection Pool
 * ใช้ mysql2/promise สำหรับ async/await และ Prepared Statements
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// สร้าง Connection Pool (ไม่ต้องสร้าง connection ใหม่ทุกครั้ง)
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'price_compare_db',
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,       // จำนวน connection สูงสุด
  queueLimit:         0,
  timezone:           '+07:00', // Thailand timezone
});

/**
 * ทดสอบการเชื่อมต่อ Database
 * เรียกใช้ตอน Server เริ่มต้น
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   กรุณาตรวจสอบ .env และตรวจสอบว่า MySQL Server กำลังทำงาน');
    process.exit(1); // หยุด Server ถ้า DB เชื่อมต่อไม่ได้
  }
}

module.exports = { pool, testConnection };
