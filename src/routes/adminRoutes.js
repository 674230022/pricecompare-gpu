/**
 * adminRoutes.js - Admin Dashboard API Routes
 * ข้อมูลสำหรับหน้า Admin: สถิติ, ร้านค้า, Scraper logs
 */

const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');

// GET /api/admin/stats - สถิติภาพรวมทั้งหมด
router.get('/stats', async (req, res) => {
  try {
    const [[{ productCount }]] = await pool.execute(
      'SELECT COUNT(*) AS productCount FROM products'
    );
    const [[{ priceCount }]] = await pool.execute(
      'SELECT COUNT(*) AS priceCount FROM prices'
    );
    const [[{ storeCount }]] = await pool.execute(
      'SELECT COUNT(*) AS storeCount FROM stores WHERE is_active = 1'
    );
    const [[{ historyCount }]] = await pool.execute(
      'SELECT COUNT(*) AS historyCount FROM price_history'
    );
    const [[{ lastUpdate }]] = await pool.execute(
      'SELECT MAX(updated_at) AS lastUpdate FROM prices'
    );
    const [[{ lowestPrice, lowestProductId }]] = await pool.execute(
      `SELECT MIN(price) AS lowestPrice, product_id AS lowestProductId
       FROM prices WHERE price IS NOT NULL`
    );

    res.json({
      success: true,
      data: {
        productCount,
        priceCount,
        storeCount,
        historyCount,
        lastUpdate,
        lowestPrice,
        lowestProductId,
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.version,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/logs - Scraper logs ล่าสุด
router.get('/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const status = req.query.status || null; // filter by status

  try {
    let query = `
      SELECT
        sl.id,
        sl.store_id,
        s.name   AS store_name,
        sl.status,
        sl.message,
        sl.items_found,
        sl.created_at
      FROM scraper_logs sl
      JOIN stores s ON sl.store_id = s.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE sl.status = ?';
      params.push(status);
    }

    query += ' ORDER BY sl.created_at DESC LIMIT ?';
    params.push(limit);

    const [logs] = await pool.execute(query, params);

    // สรุปสถานะแต่ละร้าน
    const [storeStatus] = await pool.execute(
      `SELECT
         s.id,
         s.name,
         sl.status          AS last_status,
         sl.created_at      AS last_run,
         sl.items_found
       FROM stores s
       LEFT JOIN scraper_logs sl ON sl.id = (
         SELECT id FROM scraper_logs
         WHERE store_id = s.id
         ORDER BY created_at DESC
         LIMIT 1
       )
       ORDER BY s.id`
    );

    res.json({ success: true, logs, storeStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/prices - ราคาล่าสุดของทุกสินค้า
router.get('/prices', async (req, res) => {
  try {
    const [prices] = await pool.execute(
      `SELECT
         p.id         AS product_id,
         p.name,
         p.gpu_model,
         p.brand,
         s.name       AS store_name,
         pr.price,
         pr.availability,
         pr.updated_at
       FROM prices pr
       JOIN products p ON pr.product_id = p.id
       JOIN stores s   ON pr.store_id   = s.id
       ORDER BY p.gpu_model, pr.price ASC`
    );
    res.json({ success: true, count: prices.length, data: prices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/scrape - สั่งรัน Scraper ด้วยมือ
// body: { store: 'jib' | 'advice' | 'banana' | 'ihavecpu' | 'all' }
router.post('/scrape', async (req, res) => {
  const target = (req.body.store || 'all').toLowerCase();

  const VALID = ['jib', 'advice', 'banana', 'ihavecpu', 'all'];
  if (!VALID.includes(target)) {
    return res.status(400).json({
      success: false,
      error: `Invalid store. Valid: ${VALID.join(', ')}`,
    });
  }

  // ตอบกลับทันที แล้วรัน scraper ใน background
  res.json({
    success: true,
    message: `Scrape job queued for: ${target}`,
    note:    'ตรวจสอบผลใน /api/admin/logs',
  });

  // รัน scraper แบบ non-blocking
  setImmediate(async () => {
    try {
      const scraperMap = {
        jib:      require('../scraper/jib'),
        advice:   require('../scraper/advice'),
        banana:   require('../scraper/banana'),
        ihavecpu: require('../scraper/ihavecpu'),
      };

      const toRun = target === 'all' ? Object.keys(scraperMap) : [target];

      for (const name of toRun) {
        try {
          const scraper = new scraperMap[name]();
          await scraper.run();
        } catch (e) {
          console.error(`[Admin] ${name} scrape error:`, e.message);
        }
        // เว้น 5 วินาทีระหว่างร้าน
        if (toRun.indexOf(name) < toRun.length - 1) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    } catch (err) {
      console.error('[Admin] Scrape job error:', err.message);
    }
  });
});

// GET /api/admin/scheduler - ดูสถานะ Scheduler
router.get('/scheduler', (req, res) => {
  try {
    const { getSchedulerStats } = require('../scheduler/priceScheduler');
    res.json({ success: true, data: getSchedulerStats() });
  } catch (err) {
    res.json({ success: true, data: { enabled: false, error: err.message } });
  }
});

module.exports = router;

