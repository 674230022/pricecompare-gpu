/**
 * migrate.js - Database Migration (Phase 1)
 * เพิ่ม fields ที่ขาด: variant, model_number, match_key, scraped_at
 * ไม่ลบข้อมูลเดิม — ใช้ ALTER TABLE ADD COLUMN เท่านั้น
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const pool = await mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'price_compare_db',
  });

  const migrations = [
    ["products.variant",        "ALTER TABLE products ADD COLUMN variant varchar(255) DEFAULT NULL COMMENT 'Product variant e.g. DUAL OC, TUF, GAMING X'"],
    ["products.model_number",   "ALTER TABLE products ADD COLUMN model_number varchar(255) DEFAULT NULL COMMENT 'SKU/part number e.g. DUAL-RTX4060-O8G'"],
    ["products.match_key",      "ALTER TABLE products ADD COLUMN match_key varchar(500) DEFAULT NULL COMMENT 'Dedup key: brand|gpumodel|variant|vram'"],
    ["prices.scraped_at",       "ALTER TABLE prices ADD COLUMN scraped_at datetime DEFAULT NULL COMMENT 'Timestamp when this price was scraped from store'"],
    ["idx_match_key",           "ALTER TABLE products ADD INDEX idx_match_key (match_key(250))"],
  ];

  for (const [label, sql] of migrations) {
    try {
      await pool.execute(sql);
      console.log('  OK:', label);
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME') {
        console.log('  SKIP (already exists):', label);
      } else {
        console.log('  ERR:', label, '-', e.message);
      }
    }
  }

  // ตรวจสอบ schema
  const [cols] = await pool.execute('DESCRIBE products');
  console.log('\nproducts columns:');
  cols.forEach(c => console.log(`  ${c.Field.padEnd(20)} ${c.Type}`));

  const [pcols] = await pool.execute('DESCRIBE prices');
  console.log('\nprices columns:');
  pcols.forEach(c => console.log(`  ${c.Field.padEnd(20)} ${c.Type}`));

  await pool.end();
}

run().then(() => { console.log('\n✅ Migration complete.'); process.exit(0); })
     .catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
