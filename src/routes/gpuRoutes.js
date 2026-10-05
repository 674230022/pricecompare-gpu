/**
 * gpuRoutes.js - GPU API Routes
 * จัดการ routing สำหรับข้อมูล GPU ทั้งหมด
 */

const express       = require('express');
const router        = express.Router();
const gpuController = require('../controllers/gpuController');

// GET /api/gpus          - รายการ GPU ทั้งหมด (รองรับ pagination)
router.get('/',           gpuController.getAllGpus);

// GET /api/gpus/search   - ค้นหา GPU (ต้องอยู่ก่อน /:id)
router.get('/search',     gpuController.searchGpus);

// GET /api/gpus/:id      - รายละเอียด GPU
router.get('/:id',        gpuController.getGpuById);

// GET /api/gpus/:id/prices  - ราคาแต่ละร้านของ GPU
router.get('/:id/prices', gpuController.getGpuPrices);

// GET /api/gpus/:id/history - ประวัติราคา GPU
router.get('/:id/history', gpuController.getGpuHistory);

module.exports = router;
