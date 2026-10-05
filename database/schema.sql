-- ============================================================
-- PriceCompare GPU - Database Schema
-- Database: price_compare_db
-- ============================================================

-- สร้าง Database (ถ้ายังไม่มี)
CREATE DATABASE IF NOT EXISTS price_compare_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE price_compare_db;

-- ============================================================
-- TABLE: stores
-- เก็บข้อมูลร้านค้าที่ระบบรองรับ
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL COMMENT 'ชื่อร้านค้า เช่น JIB, Advice',
  website_url VARCHAR(255)  NOT NULL COMMENT 'URL หน้าหลักของร้านค้า',
  is_active   TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '1=เปิดใช้งาน 0=ปิด',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_store_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ร้านค้าที่ระบบรองรับ';


-- ============================================================
-- TABLE: products
-- เก็บข้อมูล GPU แต่ละรุ่น (1 product = 1 GPU รุ่น)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255)  NOT NULL COMMENT 'ชื่อสินค้าหลัก เช่น ASUS GeForce RTX 5070 12GB',
  brand        VARCHAR(100)  NOT NULL COMMENT 'แบรนด์การ์ดจอ เช่น ASUS, MSI, Gigabyte',
  gpu_model    VARCHAR(100)  NOT NULL COMMENT 'รุ่น GPU เช่น RTX 5070, RX 7800 XT',
  vram         VARCHAR(20)            COMMENT 'ขนาด VRAM เช่น 12GB, 16GB',
  memory_type  VARCHAR(20)            COMMENT 'ประเภท Memory เช่น GDDR7, GDDR6X',
  interface    VARCHAR(20)            COMMENT 'Interface เช่น PCIe 5.0 x16',
  image_url    VARCHAR(500)           COMMENT 'URL รูปภาพสินค้า',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Index สำหรับการค้นหา
  INDEX idx_gpu_model  (gpu_model),
  INDEX idx_brand      (brand),
  FULLTEXT INDEX ft_search (name, brand, gpu_model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ข้อมูล GPU แต่ละรุ่น';


-- ============================================================
-- TABLE: prices
-- เก็บราคาปัจจุบันของสินค้าในแต่ละร้าน (1 record ต่อ product+store)
-- ============================================================
CREATE TABLE IF NOT EXISTS prices (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id   INT UNSIGNED  NOT NULL,
  store_id     INT UNSIGNED  NOT NULL,
  price        DECIMAL(10,2)          COMMENT 'ราคา (บาท)',
  product_url  VARCHAR(500)  NOT NULL COMMENT 'URL สินค้าในร้านค้านั้น',
  availability VARCHAR(50)   NOT NULL DEFAULT 'unknown'
                             COMMENT 'สถานะ: available, out_of_stock, unknown',
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign Keys
  CONSTRAINT fk_prices_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_prices_store   FOREIGN KEY (store_id)   REFERENCES stores(id)   ON DELETE CASCADE,

  -- 1 ร้าน ต่อ 1 product (ถ้า scrape ใหม่ให้ UPDATE แทน INSERT)
  UNIQUE KEY uq_product_store (product_id, store_id),

  -- Index สำหรับ query ราคาเรียงถูก-แพง
  INDEX idx_price        (price),
  INDEX idx_updated_at   (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ราคาปัจจุบันของสินค้าแต่ละร้าน';


-- ============================================================
-- TABLE: price_history
-- เก็บประวัติราคาเพื่อแสดงกราฟ
-- ============================================================
CREATE TABLE IF NOT EXISTS price_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED  NOT NULL,
  store_id    INT UNSIGNED  NOT NULL,
  price       DECIMAL(10,2) NOT NULL COMMENT 'ราคาที่บันทึก ณ เวลานั้น',
  recorded_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign Keys
  CONSTRAINT fk_history_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_store   FOREIGN KEY (store_id)   REFERENCES stores(id)   ON DELETE CASCADE,

  -- Index สำหรับ query history ตาม product และเวลา
  INDEX idx_history_product_time (product_id, recorded_at),
  INDEX idx_history_store        (store_id),
  INDEX idx_recorded_at          (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ประวัติราคา GPU ย้อนหลัง';


-- ============================================================
-- TABLE: scraper_logs
-- เก็บ Log การทำงานของ Scraper แต่ละครั้ง
-- ============================================================
CREATE TABLE IF NOT EXISTS scraper_logs (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id   INT UNSIGNED  NOT NULL,
  status     ENUM('success','error','skipped') NOT NULL DEFAULT 'success',
  message    TEXT                   COMMENT 'ข้อความ Error หรือรายละเอียด',
  items_found INT UNSIGNED          COMMENT 'จำนวนสินค้าที่พบ',
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign Key
  CONSTRAINT fk_log_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,

  -- Index สำหรับ Admin Dashboard
  INDEX idx_log_store      (store_id),
  INDEX idx_log_created_at (created_at),
  INDEX idx_log_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Log การทำงานของ Scraper';


-- ============================================================
-- SEED DATA: ข้อมูลร้านค้าเริ่มต้น
-- ============================================================
INSERT INTO stores (name, website_url) VALUES
  ('JIB',       'https://www.jib.co.th'),
  ('Advice',    'https://www.advice.co.th'),
  ('BaNANA',    'https://www.banana.co.th'),
  ('iHAVECPU',  'https://www.ihavecpu.com')
ON DUPLICATE KEY UPDATE website_url = VALUES(website_url);


-- ============================================================
-- SEED DATA: ข้อมูล GPU ตัวอย่าง (Demo)
-- ============================================================
INSERT INTO products (name, brand, gpu_model, vram, memory_type, interface) VALUES
  ('ASUS GeForce RTX 5070 12GB GDDR7',       'ASUS',    'RTX 5070',     '12GB', 'GDDR7',  'PCIe 5.0 x16'),
  ('MSI GeForce RTX 5070 Ti 16GB GDDR7',     'MSI',     'RTX 5070 Ti',  '16GB', 'GDDR7',  'PCIe 5.0 x16'),
  ('GIGABYTE GeForce RTX 5080 16GB GDDR7',   'GIGABYTE','RTX 5080',     '16GB', 'GDDR7',  'PCIe 5.0 x16'),
  ('ASUS GeForce RTX 4060 8GB GDDR6',        'ASUS',    'RTX 4060',     '8GB',  'GDDR6',  'PCIe 4.0 x8'),
  ('MSI GeForce RTX 4070 12GB GDDR6X',       'MSI',     'RTX 4070',     '12GB', 'GDDR6X', 'PCIe 4.0 x16'),
  ('SAPPHIRE Radeon RX 7800 XT 16GB GDDR6',  'SAPPHIRE','RX 7800 XT',   '16GB', 'GDDR6',  'PCIe 4.0 x16'),
  ('SAPPHIRE Radeon RX 7600 8GB GDDR6',      'SAPPHIRE','RX 7600',      '8GB',  'GDDR6',  'PCIe 4.0 x8'),
  ('POWERCOLOR Radeon RX 9070 16GB GDDR6',   'POWERCOLOR','RX 9070',    '16GB', 'GDDR6',  'PCIe 5.0 x16')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;


-- ============================================================
-- SEED DATA: ราคาตัวอย่าง (Demo)
-- ============================================================

-- RTX 5070 (product_id=1)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (1, 1, 29900.00, 'https://www.jib.co.th/web/product/productdetail/1/RTX-5070', 'available'),
  (1, 2, 30400.00, 'https://www.advice.co.th/product/rtx-5070',                  'available'),
  (1, 3, 30990.00, 'https://www.banana.co.th/product/rtx-5070',                  'available'),
  (1, 4, 30500.00, 'https://www.ihavecpu.com/product/rtx-5070',                  'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;

-- RTX 5070 Ti (product_id=2)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (2, 1, 39900.00, 'https://www.jib.co.th/web/product/productdetail/1/RTX-5070-Ti', 'available'),
  (2, 2, 40500.00, 'https://www.advice.co.th/product/rtx-5070-ti',                   'available'),
  (2, 3, 40990.00, 'https://www.banana.co.th/product/rtx-5070-ti',                   'available'),
  (2, 4, 40200.00, 'https://www.ihavecpu.com/product/rtx-5070-ti',                   'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;

-- RTX 5080 (product_id=3)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (3, 1, 54900.00, 'https://www.jib.co.th/web/product/productdetail/1/RTX-5080', 'available'),
  (3, 2, 55500.00, 'https://www.advice.co.th/product/rtx-5080',                   'available'),
  (3, 3, 55990.00, 'https://www.banana.co.th/product/rtx-5080',                   'available'),
  (3, 4, 54500.00, 'https://www.ihavecpu.com/product/rtx-5080',                   'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;

-- RTX 4060 (product_id=4)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (4, 1, 8490.00, 'https://www.jib.co.th/web/product/productdetail/1/RTX-4060', 'available'),
  (4, 2, 8690.00, 'https://www.advice.co.th/product/rtx-4060',                   'available'),
  (4, 3, 8790.00, 'https://www.banana.co.th/product/rtx-4060',                   'available'),
  (4, 4, 8590.00, 'https://www.ihavecpu.com/product/rtx-4060',                   'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;

-- RTX 4070 (product_id=5)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (5, 1, 17900.00, 'https://www.jib.co.th/web/product/productdetail/1/RTX-4070', 'available'),
  (5, 2, 18200.00, 'https://www.advice.co.th/product/rtx-4070',                   'available'),
  (5, 3, 18490.00, 'https://www.banana.co.th/product/rtx-4070',                   'available'),
  (5, 4, 17990.00, 'https://www.ihavecpu.com/product/rtx-4070',                   'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;

-- RX 7800 XT (product_id=6)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (6, 1, 14900.00, 'https://www.jib.co.th/web/product/productdetail/1/RX-7800-XT', 'available'),
  (6, 2, 15200.00, 'https://www.advice.co.th/product/rx-7800-xt',                   'available'),
  (6, 3, 15490.00, 'https://www.banana.co.th/product/rx-7800-xt',                   'available'),
  (6, 4, 14990.00, 'https://www.ihavecpu.com/product/rx-7800-xt',                   'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;

-- RX 7600 (product_id=7)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (7, 1,  7990.00, 'https://www.jib.co.th/web/product/productdetail/1/RX-7600', 'available'),
  (7, 2,  8190.00, 'https://www.advice.co.th/product/rx-7600',                   'available'),
  (7, 3,  8290.00, 'https://www.banana.co.th/product/rx-7600',                   'available'),
  (7, 4,  8090.00, 'https://www.ihavecpu.com/product/rx-7600',                   'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;

-- RX 9070 (product_id=8)
INSERT INTO prices (product_id, store_id, price, product_url, availability) VALUES
  (8, 1, 21900.00, 'https://www.jib.co.th/web/product/productdetail/1/RX-9070', 'available'),
  (8, 2, 22400.00, 'https://www.advice.co.th/product/rx-9070',                   'available'),
  (8, 3, 22990.00, 'https://www.banana.co.th/product/rx-9070',                   'available'),
  (8, 4, 22200.00, 'https://www.ihavecpu.com/product/rx-9070',                   'available')
ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = CURRENT_TIMESTAMP;


-- ============================================================
-- SEED DATA: Price History ตัวอย่าง (RTX 5070 ย้อนหลัง 7 วัน)
-- ============================================================
INSERT INTO price_history (product_id, store_id, price, recorded_at) VALUES
  -- JIB
  (1, 1, 31500.00, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (1, 1, 31200.00, DATE_SUB(NOW(), INTERVAL 5 DAY)),
  (1, 1, 30900.00, DATE_SUB(NOW(), INTERVAL 4 DAY)),
  (1, 1, 30500.00, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (1, 1, 30200.00, DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (1, 1, 29900.00, DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (1, 1, 29900.00, NOW()),
  -- Advice
  (1, 2, 32000.00, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (1, 2, 31500.00, DATE_SUB(NOW(), INTERVAL 5 DAY)),
  (1, 2, 31000.00, DATE_SUB(NOW(), INTERVAL 4 DAY)),
  (1, 2, 30800.00, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (1, 2, 30600.00, DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (1, 2, 30400.00, DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (1, 2, 30400.00, NOW()),
  -- BaNANA
  (1, 3, 32500.00, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (1, 3, 32000.00, DATE_SUB(NOW(), INTERVAL 5 DAY)),
  (1, 3, 31500.00, DATE_SUB(NOW(), INTERVAL 4 DAY)),
  (1, 3, 31200.00, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (1, 3, 31000.00, DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (1, 3, 30990.00, DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (1, 3, 30990.00, NOW()),
  -- iHAVECPU
  (1, 4, 31800.00, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (1, 4, 31300.00, DATE_SUB(NOW(), INTERVAL 5 DAY)),
  (1, 4, 31000.00, DATE_SUB(NOW(), INTERVAL 4 DAY)),
  (1, 4, 30800.00, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (1, 4, 30700.00, DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (1, 4, 30500.00, DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (1, 4, 30500.00, NOW());
