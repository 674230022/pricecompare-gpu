/**
 * gpuController.js - GPU Business Logic
 * PriceCompare GPU
 *
 * ร้านที่แสดง:
 * - JIB
 * - BaNANA
 * - iHAVECPU
 *
 * Advice:
 * - ไม่แสดง
 * - ไม่ถูกนำมาคำนวณราคา
 * - ไม่ถูกนำมานับจำนวนร้าน
 * - ไม่ถูกนำมาคำนวณเวลาอัปเดต
 *
 * ใช้ match_key เป็นตัวระบุสินค้าเดียวกัน
 */

const { pool } = require('../config/database');

// ============================================================
// Helper
// ============================================================

function buildGroupKey(product) {
  if (
    product.match_key !== null &&
    product.match_key !== undefined &&
    String(product.match_key).trim() !== ''
  ) {
    return `MATCH:${product.match_key}`;
  }

  return `PRODUCT:${product.id}`;
}

function isValidPrice(price) {
  if (price === null || price === undefined) {
    return false;
  }

  const number = Number(price);

  return Number.isFinite(number) && number > 0;
}

/**
 * ใช้ scraped_at เพราะเป็นเวลาที่ Scraper ดึงข้อมูลจริง
 */
function getLatestUpdated(prices) {
  const dates = prices
    .map(p => p.scraped_at)
    .filter(Boolean);

  if (dates.length === 0) {
    return null;
  }

  dates.sort(
    (a, b) => new Date(b) - new Date(a)
  );

  return dates[0];
}

function addPriceToGroup(group, row) {
  if (
    row.price_id === null ||
    row.price_id === undefined ||
    row.store_id === null ||
    row.store_id === undefined
  ) {
    return;
  }

  group.prices.push({
    id: row.price_id,
    store_id: row.store_id,
    store_name: row.store_name,
    store_url: row.store_url,

    price:
      row.price !== null &&
      row.price !== undefined
        ? Number(row.price)
        : null,

    product_url: row.product_url,
    availability: row.availability,

    updated_at: row.updated_at,
    scraped_at: row.scraped_at
  });
}

function updateGroupProduct(group, row) {
  // ใช้ชื่อที่สมบูรณ์กว่า
  if (
    (!group.name ||
      group.name.length < (row.name?.length || 0)) &&
    row.name
  ) {
    group.name = row.name;
  }

  // รูป
  if (!group.image_url && row.image_url) {
    group.image_url = row.image_url;
  }

  // Brand
  if (!group.brand && row.brand) {
    group.brand = row.brand;
  }

  // GPU Model
  if (!group.gpu_model && row.gpu_model) {
    group.gpu_model = row.gpu_model;
  }

  // VRAM
  if (!group.vram && row.vram) {
    group.vram = row.vram;
  }

  // Memory Type
  if (!group.memory_type && row.memory_type) {
    group.memory_type = row.memory_type;
  }

  // Interface
  if (!group.interface && row.interface) {
    group.interface = row.interface;
  }
}

function groupToApiObject(group) {
  const validPrices = group.prices.filter(
    p =>
      p.price !== null &&
      Number.isFinite(p.price) &&
      p.price > 0
  );

  const lowestPrice =
    validPrices.length > 0
      ? Math.min(
          ...validPrices.map(p => p.price)
        )
      : null;

  const highestPrice =
    validPrices.length > 0
      ? Math.max(
          ...validPrices.map(p => p.price)
        )
      : null;

  // 1 ร้าน = 1 store_id
  const storeCount = new Set(
    validPrices.map(p => p.store_id)
  ).size;

  const lastUpdated = getLatestUpdated(
    group.prices
  );

  return {
    id: group.id,
    name: group.name,
    brand: group.brand,
    gpu_model: group.gpu_model,
    vram: group.vram,
    memory_type: group.memory_type,
    interface: group.interface,
    image_url: group.image_url,
    match_key: group.match_key,

    lowest_price: lowestPrice,
    highest_price: highestPrice,
    store_count: storeCount,

    // เวลาที่ Scraper ดึงข้อมูลล่าสุด
    last_updated: lastUpdated
  };
}

// ============================================================
// GET /api/gpus
// ============================================================

async function getAllGpus(req, res) {
  try {
    const page = Math.max(
      parseInt(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      parseInt(req.query.limit) || 20,
      100
    );

    const offset = (page - 1) * limit;

    const brand = req.query.brand || null;

    const sortBy =
      req.query.sortBy || 'lowest_price';

    // --------------------------------------------------------
    // WHERE
    // --------------------------------------------------------

    const where = brand
      ? 'WHERE p.brand = ?'
      : '';

    const params = brand
      ? [brand]
      : [];

    // --------------------------------------------------------
    // Products + Prices
    // ไม่เอา Advice
    // --------------------------------------------------------

    const [rows] = await pool.execute(
      `
      SELECT
        p.id,
        p.name,
        p.brand,
        p.gpu_model,
        p.vram,
        p.memory_type,
        p.interface,
        p.image_url,
        p.match_key,

        pr.id AS price_id,
        pr.store_id,
        pr.price,
        pr.product_url,
        pr.availability,
        pr.updated_at,
        pr.scraped_at,

        s.name AS store_name,
        s.website_url AS store_url

      FROM products p

      LEFT JOIN prices pr
        ON p.id = pr.product_id
        AND pr.store_id IN (
          SELECT id
          FROM stores
          WHERE UPPER(name) NOT LIKE '%ADVICE%'
        )

      LEFT JOIN stores s
        ON pr.store_id = s.id

      ${where}

      ORDER BY p.id ASC
      `,
      params
    );

    // --------------------------------------------------------
    // Group Products
    // --------------------------------------------------------

    const groups = new Map();

    for (const row of rows) {
      const key = buildGroupKey(row);

      if (!groups.has(key)) {
        groups.set(key, {
          id: row.id,
          name: row.name,
          brand: row.brand,
          gpu_model: row.gpu_model,
          vram: row.vram,
          memory_type: row.memory_type,
          interface: row.interface,
          image_url: row.image_url,
          match_key: row.match_key,
          prices: []
        });
      }

      const group = groups.get(key);

      updateGroupProduct(group, row);

      addPriceToGroup(group, row);
    }

    // --------------------------------------------------------
    // Convert
    // --------------------------------------------------------

    let gpus = Array.from(
      groups.values()
    ).map(groupToApiObject);

    // ไม่แสดง Product ที่ไม่มีราคาจากร้านที่ใช้งาน
    gpus = gpus.filter(
      gpu => gpu.store_count > 0
    );

    // --------------------------------------------------------
    // Sort
    // --------------------------------------------------------

    gpus.sort((a, b) => {
      // ชื่อ
      if (sortBy === 'name') {
        return String(a.name || '').localeCompare(
          String(b.name || ''),
          'th'
        );
      }

      // ราคาสูงสุด
      if (sortBy === 'highest_price') {
        const priceA = a.highest_price ?? -1;
        const priceB = b.highest_price ?? -1;

        return priceB - priceA;
      }

      // อัปเดตล่าสุด
      if (sortBy === 'updated') {
        return (
          new Date(b.last_updated || 0) -
          new Date(a.last_updated || 0)
        );
      }

      // Default = ราคาต่ำสุด
      const priceA =
        a.lowest_price ?? 999999999;

      const priceB =
        b.lowest_price ?? 999999999;

      return priceA - priceB;
    });

    // --------------------------------------------------------
    // Pagination
    // --------------------------------------------------------

    const total = gpus.length;

    const pagedGpus = gpus.slice(
      offset,
      offset + limit
    );

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.json({
      success: true,

      data: pagedGpus,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(
          total / limit
        )
      }
    });

  } catch (err) {
    console.error(
      '[GPU API] getAllGpus error:',
      err
    );

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// ============================================================
// GET /api/gpus/search?q=RTX5070
// ============================================================

async function searchGpus(req, res) {
  const q = String(
    req.query.q || ''
  ).trim();

  if (!q) {
    return res.status(400).json({
      success: false,
      error: 'กรุณาระบุคำค้นหา (q)'
    });
  }

  if (q.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'คำค้นหาต้องมีอย่างน้อย 2 ตัวอักษร'
    });
  }

  try {
    const keyword = `%${q}%`;

    // --------------------------------------------------------
    // Search
    // --------------------------------------------------------

    const [rows] = await pool.execute(
      `
      SELECT
        p.id,
        p.name,
        p.brand,
        p.gpu_model,
        p.vram,
        p.memory_type,
        p.interface,
        p.image_url,
        p.match_key,

        pr.id AS price_id,
        pr.store_id,
        pr.price,
        pr.product_url,
        pr.availability,
        pr.updated_at,
        pr.scraped_at,

        s.name AS store_name,
        s.website_url AS store_url

      FROM products p

      LEFT JOIN prices pr
        ON p.id = pr.product_id
        AND pr.store_id IN (
          SELECT id
          FROM stores
          WHERE UPPER(name) NOT LIKE '%ADVICE%'
        )

      LEFT JOIN stores s
        ON pr.store_id = s.id

      WHERE
        p.name LIKE ?
        OR p.brand LIKE ?
        OR p.gpu_model LIKE ?
        OR p.match_key LIKE ?

      ORDER BY p.id ASC
      `,
      [
        keyword,
        keyword,
        keyword,
        keyword
      ]
    );

    // --------------------------------------------------------
    // Group Search Results
    // --------------------------------------------------------

    const groups = new Map();

    for (const row of rows) {
      const key = buildGroupKey(row);

      if (!groups.has(key)) {
        groups.set(key, {
          id: row.id,
          name: row.name,
          brand: row.brand,
          gpu_model: row.gpu_model,
          vram: row.vram,
          memory_type: row.memory_type,
          interface: row.interface,
          image_url: row.image_url,
          match_key: row.match_key,
          prices: []
        });
      }

      const group = groups.get(key);

      updateGroupProduct(group, row);

      addPriceToGroup(group, row);
    }

    let results = Array.from(
      groups.values()
    ).map(groupToApiObject);

    // ไม่แสดงสินค้าที่ไม่มีราคาจากร้านที่ใช้งาน
    results = results.filter(
      gpu => gpu.store_count > 0
    );

    // ราคาต่ำสุดก่อน
    results.sort(
      (a, b) =>
        (a.lowest_price ?? 999999999) -
        (b.lowest_price ?? 999999999)
    );

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.json({
      success: true,
      query: q,
      count: results.length,
      data: results
    });

  } catch (err) {
    console.error(
      '[GPU API] searchGpus error:',
      err
    );

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// ============================================================
// GET /api/gpus/:id
// รายละเอียด GPU + ราคาทุกร้าน
// ============================================================

async function getGpuById(req, res) {
  const id = parseInt(
    req.params.id
  );

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid GPU ID'
    });
  }

  try {
    // --------------------------------------------------------
    // หา Product
    // --------------------------------------------------------

    const [[product]] =
      await pool.execute(
        `
        SELECT *
        FROM products
        WHERE id = ?
        `,
        [id]
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'GPU not found'
      });
    }

    // --------------------------------------------------------
    // หา Product ในกลุ่มเดียวกัน
    // --------------------------------------------------------

    let products = [];

    if (
      product.match_key !== null &&
      product.match_key !== undefined &&
      String(product.match_key).trim() !== ''
    ) {
      const [
        matchedProducts
      ] = await pool.execute(
        `
        SELECT *
        FROM products
        WHERE match_key = ?
        ORDER BY id ASC
        `,
        [product.match_key]
      );

      products = matchedProducts;
    } else {
      products = [product];
    }

    // --------------------------------------------------------
    // Product IDs
    // --------------------------------------------------------

    const productIds = products.map(
      p => p.id
    );

    // --------------------------------------------------------
    // ดึงราคา
    // ไม่เอา Advice
    // --------------------------------------------------------

    let prices = [];

    if (productIds.length > 0) {
      const placeholders =
        productIds
          .map(() => '?')
          .join(',');

      const [
        priceRows
      ] = await pool.execute(
        `
        SELECT
          pr.id,
          pr.product_id,
          pr.store_id,
          s.name AS store_name,
          s.website_url AS store_url,
          pr.price,
          pr.product_url,
          pr.availability,
          pr.updated_at,
          pr.scraped_at

        FROM prices pr

        JOIN stores s
          ON pr.store_id = s.id

        WHERE
          pr.product_id IN (${placeholders})

          AND pr.store_id IN (
            SELECT id
            FROM stores
            WHERE UPPER(name) NOT LIKE '%ADVICE%'
          )

        ORDER BY
          CASE
            WHEN pr.price IS NULL THEN 1
            ELSE 0
          END,

          pr.price ASC
        `,
        productIds
      );

      prices = priceRows;
    }

    // --------------------------------------------------------
    // กันร้านเดียวกันซ้ำ
    // เลือกข้อมูลที่ Scrape ล่าสุด
    // --------------------------------------------------------

    const storeMap = new Map();

    for (const price of prices) {
      const storeId = price.store_id;

      const existing =
        storeMap.get(storeId);

      if (!existing) {
        storeMap.set(
          storeId,
          price
        );
        continue;
      }

      const currentHasPrice =
        isValidPrice(existing.price);

      const newHasPrice =
        isValidPrice(price.price);

      if (
        !currentHasPrice &&
        newHasPrice
      ) {
        storeMap.set(
          storeId,
          price
        );
        continue;
      }

      if (
        currentHasPrice &&
        newHasPrice &&
        new Date(
          price.scraped_at || 0
        ) >
        new Date(
          existing.scraped_at || 0
        )
      ) {
        storeMap.set(
          storeId,
          price
        );
      }
    }

    prices = Array.from(
      storeMap.values()
    );

    // --------------------------------------------------------
    // Stats
    // --------------------------------------------------------

    const validPrices =
      prices.filter(
        p => isValidPrice(p.price)
      );

    const lowestPrice =
      validPrices.length > 0
        ? Math.min(
            ...validPrices.map(
              p => Number(p.price)
            )
          )
        : null;

    const highestPrice =
      validPrices.length > 0
        ? Math.max(
            ...validPrices.map(
              p => Number(p.price)
            )
          )
        : null;

    const priceDiff =
      lowestPrice !== null &&
      highestPrice !== null
        ? highestPrice - lowestPrice
        : null;

    const storeCount =
      new Set(
        validPrices.map(
          p => p.store_id
        )
      ).size;

    // --------------------------------------------------------
    // Product หลัก
    // --------------------------------------------------------

    const mainProduct =
      products.find(
        p => p.id === product.id
      ) || product;

    // --------------------------------------------------------
    // รูปหลัก
    // --------------------------------------------------------

    let imageUrl =
      mainProduct.image_url;

    if (!imageUrl) {
      const productWithImage =
        products.find(
          p => p.image_url
        );

      imageUrl =
        productWithImage
          ? productWithImage.image_url
          : null;
    }

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.json({
      success: true,

      data: {
        ...mainProduct,

        image_url: imageUrl,

        prices,

        stats: {
          lowestPrice,
          highestPrice,
          priceDiff,
          storeCount
        }
      }
    });

  } catch (err) {
    console.error(
      '[GPU API] getGpuById error:',
      err
    );

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// ============================================================
// GET /api/gpus/:id/prices
// ============================================================

async function getGpuPrices(req, res) {
  const id = parseInt(
    req.params.id
  );

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid GPU ID'
    });
  }

  try {
    // --------------------------------------------------------
    // หา Product
    // --------------------------------------------------------

    const [[product]] =
      await pool.execute(
        `
        SELECT
          id,
          name,
          brand,
          gpu_model,
          match_key
        FROM products
        WHERE id = ?
        `,
        [id]
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'GPU not found'
      });
    }

    // --------------------------------------------------------
    // หา Product ทั้งกลุ่ม
    // --------------------------------------------------------

    let productIds = [product.id];

    if (
      product.match_key !== null &&
      product.match_key !== undefined &&
      String(product.match_key).trim() !== ''
    ) {
      const [matched] =
        await pool.execute(
          `
          SELECT id
          FROM products
          WHERE match_key = ?
          `,
          [product.match_key]
        );

      productIds = matched.map(
        row => row.id
      );
    }

    // --------------------------------------------------------
    // ดึงราคา
    // ไม่เอา Advice
    // --------------------------------------------------------

    const placeholders =
      productIds
        .map(() => '?')
        .join(',');

    const [rows] =
      await pool.execute(
        `
        SELECT
          pr.id,
          pr.product_id,
          pr.store_id,
          s.name AS store_name,
          s.website_url AS store_url,
          pr.price,
          pr.product_url,
          pr.availability,
          pr.updated_at,
          pr.scraped_at

        FROM prices pr

        JOIN stores s
          ON pr.store_id = s.id

        WHERE
          pr.product_id IN (${placeholders})

          AND pr.store_id IN (
            SELECT id
            FROM stores
            WHERE UPPER(name) NOT LIKE '%ADVICE%'
          )

        ORDER BY
          CASE
            WHEN pr.price IS NULL THEN 1
            ELSE 0
          END,

          pr.price ASC
        `,
        productIds
      );

    // --------------------------------------------------------
    // ร้านละ 1 record
    // --------------------------------------------------------

    const storeMap = new Map();

    for (const row of rows) {
      const existing =
        storeMap.get(row.store_id);

      if (!existing) {
        storeMap.set(
          row.store_id,
          row
        );
        continue;
      }

      const existingPrice =
        isValidPrice(existing.price);

      const newPrice =
        isValidPrice(row.price);

      // เดิมไม่มีราคา แต่ใหม่มี
      if (
        !existingPrice &&
        newPrice
      ) {
        storeMap.set(
          row.store_id,
          row
        );
        continue;
      }

      // ทั้งคู่มีราคา
      // เลือกข้อมูลที่ Scrape ล่าสุด
      if (
        existingPrice &&
        newPrice &&
        new Date(
          row.scraped_at || 0
        ) >
        new Date(
          existing.scraped_at || 0
        )
      ) {
        storeMap.set(
          row.store_id,
          row
        );
      }
    }

    const prices =
      Array.from(
        storeMap.values()
      );

    // --------------------------------------------------------
    // Price Difference
    // --------------------------------------------------------

    const validPrices =
      prices.filter(
        p => isValidPrice(p.price)
      );

    if (validPrices.length > 0) {
      const minPrice =
        Math.min(
          ...validPrices.map(
            p => Number(p.price)
          )
        );

      prices.forEach(p => {
        if (isValidPrice(p.price)) {
          p.price_diff =
            Number(p.price) -
            minPrice;

          p.is_lowest =
            Number(p.price) ===
            minPrice;
        }
      });
    }

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.json({
      success: true,
      product,
      data: prices
    });

  } catch (err) {
    console.error(
      '[GPU API] getGpuPrices error:',
      err
    );

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// ============================================================
// GET /api/gpus/:id/history
// ============================================================

async function getGpuHistory(req, res) {
  const id = parseInt(
    req.params.id
  );

  const days = Math.min(
    parseInt(req.query.days) || 7,
    90
  );

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid GPU ID'
    });
  }

  try {
    // --------------------------------------------------------
    // หา Product
    // --------------------------------------------------------

    const [[product]] =
      await pool.execute(
        `
        SELECT
          id,
          name,
          brand,
          gpu_model,
          match_key
        FROM products
        WHERE id = ?
        `,
        [id]
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'GPU not found'
      });
    }

    // --------------------------------------------------------
    // หา Product ในกลุ่ม
    // --------------------------------------------------------

    let productIds = [product.id];

    if (
      product.match_key !== null &&
      product.match_key !== undefined &&
      String(product.match_key).trim() !== ''
    ) {
      const [matched] =
        await pool.execute(
          `
          SELECT id
          FROM products
          WHERE match_key = ?
          `,
          [product.match_key]
        );

      productIds = matched.map(
        row => row.id
      );
    }

    // --------------------------------------------------------
    // History
    // ไม่เอา Advice
    // --------------------------------------------------------

    const placeholders =
      productIds
        .map(() => '?')
        .join(',');

    const [history] =
      await pool.execute(
        `
        SELECT
          ph.store_id,
          s.name AS store_name,
          ph.price,

          DATE(
            ph.recorded_at
          ) AS date,

          ph.recorded_at

        FROM price_history ph

        JOIN stores s
          ON ph.store_id = s.id

        WHERE
          ph.product_id IN (${placeholders})

          AND ph.store_id IN (
            SELECT id
            FROM stores
            WHERE UPPER(name) NOT LIKE '%ADVICE%'
          )

          AND ph.recorded_at >=
            DATE_SUB(
              NOW(),
              INTERVAL ? DAY
            )

        ORDER BY
          ph.recorded_at ASC
        `,
        [
          ...productIds,
          days
        ]
      );

    // --------------------------------------------------------
    // Group by Store
    // --------------------------------------------------------

    const grouped = {};

    history.forEach(row => {
      const key = row.store_name;

      if (!grouped[key]) {
        grouped[key] = {
          storeId: row.store_id,
          storeName: key,
          data: []
        };
      }

      grouped[key].data.push({
        date: row.date,
        price: Number(row.price)
      });
    });

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.json({
      success: true,
      product,
      days,
      history: Object.values(grouped)
    });

  } catch (err) {
    console.error(
      '[GPU API] getGpuHistory error:',
      err
    );

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getAllGpus,
  searchGpus,
  getGpuById,
  getGpuPrices,
  getGpuHistory
};