/**
 * app.js - Express Server หลัก
 * PriceCompare GPU - เว็บไซต์เปรียบเทียบราคา GPU
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { testConnection } = require('./config/database');
const logger = require('./utils/logger');

// Import Routes
const gpuRoutes = require('./routes/gpuRoutes');
const storeRoutes = require('./routes/storeRoutes');
const historyRoutes = require('./routes/historyRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Path ของโฟลเดอร์ public
// ============================================================

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

console.log('[SERVER] Public directory:', PUBLIC_DIR);

// ============================================================
// Middleware
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS
app.use(cors());

// ============================================================
// Static Files
// ============================================================

app.use(express.static(PUBLIC_DIR));

// ============================================================
// เปิดหน้า HTML โดยตรง
// ============================================================

// หน้าแรก
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// หน้า GPU
app.get('/gpu.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'gpu.html'));
});

// หน้าเปรียบเทียบ
app.get('/compare.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'compare.html'));
});

// หน้าประวัติราคา
app.get('/history.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'history.html'));
});

// หน้า Admin
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// ============================================================
// API Routes
// ============================================================

app.use('/api/gpus', gpuRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/admin', adminRoutes);

// ============================================================
// GET /api/status
// ============================================================

app.get('/api/status', async (req, res) => {
  const { pool } = require('./config/database');

  try {

    // จำนวนสินค้า
    const [[{ productCount }]] = await pool.execute(
      'SELECT COUNT(*) AS productCount FROM products'
    );

    // จำนวนราคา
    const [[{ priceCount }]] = await pool.execute(
      'SELECT COUNT(*) AS priceCount FROM prices'
    );

    // จำนวนร้าน
    const [[{ storeCount }]] = await pool.execute(
      'SELECT COUNT(*) AS storeCount FROM stores WHERE is_active = 1'
    );

    // เวลาอัปเดตล่าสุด
    const [[{ lastUpdate }]] = await pool.execute(
      'SELECT MAX(updated_at) AS lastUpdate FROM prices'
    );

    // Logs ล่าสุด
    const [recentLogs] = await pool.execute(
      `SELECT 
          sl.*,
          s.name AS store_name
       FROM scraper_logs sl
       JOIN stores s ON sl.store_id = s.id
       ORDER BY sl.created_at DESC
       LIMIT 10`
    );

    res.json({
      status: 'ok',

      uptime: Math.floor(process.uptime()),

      environment:
        process.env.NODE_ENV || 'development',

      database: 'connected',

      scheduler: (() => {
        try {
          return require('./scheduler/priceScheduler')
            .getSchedulerStats();
        } catch {
          return {
            enabled: false
          };
        }
      })(),

      stats: {
        products: productCount,
        prices: priceCount,
        stores: storeCount,
        lastUpdate: lastUpdate
      },

      recentLogs
    });

  } catch (err) {

    console.error('[API STATUS ERROR]', err);

    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      message: err.message
    });

  }
});

// ============================================================
// API 404
// ============================================================

app.use('/api', (req, res) => {

  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });

});

// ============================================================
// Error Handler
// ============================================================

app.use((err, req, res, next) => {

  logger.error(
    `Unhandled Error: ${err.message}`
  );

  res.status(500).json({

    error: 'Internal Server Error',

    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Something went wrong'

  });

});

// ============================================================
// Start Server
// ============================================================

async function startServer() {

  // 1. ตรวจสอบ Database
  await testConnection();

  // 2. Scheduler
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ENABLE_SCHEDULER === 'true'
  ) {

    try {

      const {
        startScheduler
      } = require('./scheduler/priceScheduler');

      startScheduler();

      logger.info('Scheduler started');

    } catch (err) {

      logger.warn(
        `Scheduler not started: ${err.message}`
      );

    }

  }

  // 3. Start Express
  app.listen(PORT, () => {

    logger.success(
      `Server running at http://localhost:${PORT}`
    );

    logger.info(
      `Environment: ${
        process.env.NODE_ENV || 'development'
      }`
    );

    logger.info(
      `Public directory: ${PUBLIC_DIR}`
    );

    logger.info(
      `Press Ctrl+C to stop`
    );

  });

}

// ============================================================
// Run Server
// ============================================================

startServer().catch((err) => {

  logger.error(
    `Failed to start server: ${err.message}`
  );

  process.exit(1);

});