/**
 * storeRoutes.js - Store API Routes
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');

// GET /api/stores - รายการร้านค้าทั้งหมด
router.get('/', async (req, res) => {
  try {
    const [stores] = await pool.execute(
      `SELECT
         s.id,
         s.name,
         s.website_url,
         s.is_active,
         s.created_at,
         COUNT(DISTINCT p.product_id) AS product_count,
         MAX(p.updated_at)            AS last_updated
       FROM stores s
       LEFT JOIN prices p ON s.id = p.store_id
       GROUP BY s.id
       ORDER BY s.id ASC`
    );
    res.json({ success: true, data: stores });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stores/:id - รายละเอียดร้านค้า
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid store ID' });
  }
  try {
    const [[store]] = await pool.execute(
      'SELECT * FROM stores WHERE id = ?', [id]
    );
    if (!store) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    // ดึง log ล่าสุดของร้านนี้
    const [logs] = await pool.execute(
      `SELECT status, message, items_found, created_at
       FROM scraper_logs
       WHERE store_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [id]
    );

    res.json({ success: true, data: { ...store, recent_logs: logs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
