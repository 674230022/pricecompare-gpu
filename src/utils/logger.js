/**
 * logger.js - Logging Utility
 * จัดการ Log ทั้งใน Console และ Database (scraper_logs)
 */

const { pool } = require('../config/database');

// สี console สำหรับ development
const colors = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

/**
 * แสดง Log พร้อม timestamp และสี
 */
function formatLog(level, message) {
  const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
  const levelMap = {
    INFO:    `${colors.cyan}[INFO]${colors.reset}`,
    SUCCESS: `${colors.green}[SUCCESS]${colors.reset}`,
    WARN:    `${colors.yellow}[WARN]${colors.reset}`,
    ERROR:   `${colors.red}[ERROR]${colors.reset}`,
    SCRAPER: `${colors.gray}[SCRAPER]${colors.reset}`,
  };
  const prefix = levelMap[level] || `[${level}]`;
  console.log(`${colors.gray}${time}${colors.reset} ${prefix} ${message}`);
}

const logger = {
  info:    (msg) => formatLog('INFO', msg),
  success: (msg) => formatLog('SUCCESS', msg),
  warn:    (msg) => formatLog('WARN', msg),
  error:   (msg) => formatLog('ERROR', msg),
  scraper: (msg) => formatLog('SCRAPER', msg),

  /**
   * บันทึก Log ของ Scraper ลง Database (scraper_logs)
   * @param {number} storeId - ID ของร้านค้า
   * @param {'success'|'error'|'skipped'} status
   * @param {string} message - ข้อความ
   * @param {number|null} itemsFound - จำนวนสินค้าที่พบ
   */
  async saveScraperLog(storeId, status, message, itemsFound = null) {
    try {
      await pool.execute(
        `INSERT INTO scraper_logs (store_id, status, message, items_found)
         VALUES (?, ?, ?, ?)`,
        [storeId, status, message, itemsFound]
      );
    } catch (err) {
      // ไม่ให้ log error หยุด app
      console.error('Failed to save scraper log:', err.message);
    }
  },
};

module.exports = logger;
