/**
 * historyRoutes.js - Price History API Routes
 */

const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');

// GET /api/history/:productId - ประวัติราคาของ GPU แยกตามร้าน
router.get('/:productId', async (req, res) => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) {
    return res.status(400).json({ success: false, error: 'Invalid product ID' });
  }

  // รับ query params: days=7 (default), storeId=1 (optional)
  const days    = Math.min(parseInt(req.query.days) || 7, 90); // สูงสุด 90 วัน
  const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

  try {
    // Validate product มีอยู่จริง
    const [[product]] = await pool.execute(
      'SELECT id, name, gpu_model FROM products WHERE id = ?', [productId]
    );
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Query ประวัติราคา
    let query = `
      SELECT
        ph.id,
        ph.product_id,
        ph.store_id,
        s.name      AS store_name,
        ph.price,
        ph.recorded_at
      FROM price_history ph
      JOIN stores s ON ph.store_id = s.id
      WHERE ph.product_id = ?
        AND ph.recorded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    const params = [productId, days];

    if (storeId) {
      query += ' AND ph.store_id = ?';
      params.push(storeId);
    }

    query += ' ORDER BY ph.recorded_at ASC, ph.store_id ASC';

    const [rows] = await pool.execute(query, params);

    // จัดกลุ่มข้อมูลตาม store เพื่อให้ Chart.js ใช้งานง่าย
    const grouped = {};
    rows.forEach((row) => {
      if (!grouped[row.store_name]) {
        grouped[row.store_name] = {
          storeId:   row.store_id,
          storeName: row.store_name,
          data:      [],
        };
      }
      grouped[row.store_name].data.push({
        date:  row.recorded_at,
        price: parseFloat(row.price),
      });
    });

    res.json({
      success: true,
      product,
      days,
      history: Object.values(grouped),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
