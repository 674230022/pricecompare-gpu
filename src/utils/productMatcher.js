/**
 * productMatcher.js
 * GPU Product Matching Utility
 *
 * หน้าที่:
 * 1. วิเคราะห์ชื่อ GPU
 * 2. แยก Brand / GPU Model / Variant / VRAM
 * 3. สร้าง match_key
 * 4. จับคู่สินค้าเดิม
 * 5. สร้างสินค้าใหม่เมื่อไม่พบ
 * 6. อัปเดตรูปสินค้าเมื่อ scraper พบรูปใหม่
 * 7. ป้องกัน placeholder / รูปโปรโมชั่น
 * 8. บันทึกราคาและประวัติราคา
 */

const { pool } = require('../config/database');

// ============================================================
// GPU MODEL PATTERNS
// ============================================================

const GPU_PATTERNS = [
  // NVIDIA RTX 50 Series
  { pattern: /RTX\s*5090/i, model: 'RTX 5090' },
  { pattern: /RTX\s*5080/i, model: 'RTX 5080' },
  { pattern: /RTX\s*5070\s*Ti/i, model: 'RTX 5070 Ti' },
  { pattern: /RTX\s*5070\s*SUPER/i, model: 'RTX 5070 SUPER' },
  { pattern: /RTX\s*5070/i, model: 'RTX 5070' },
  { pattern: /RTX\s*5060\s*Ti/i, model: 'RTX 5060 Ti' },
  { pattern: /RTX\s*5060/i, model: 'RTX 5060' },
  { pattern: /RTX\s*5050/i, model: 'RTX 5050' },

  // NVIDIA RTX 40 Series
  { pattern: /RTX\s*4090/i, model: 'RTX 4090' },
  { pattern: /RTX\s*4080\s*SUPER/i, model: 'RTX 4080 SUPER' },
  { pattern: /RTX\s*4080/i, model: 'RTX 4080' },
  { pattern: /RTX\s*4070\s*Ti\s*SUPER/i, model: 'RTX 4070 Ti SUPER' },
  { pattern: /RTX\s*4070\s*Ti/i, model: 'RTX 4070 Ti' },
  { pattern: /RTX\s*4070\s*SUPER/i, model: 'RTX 4070 SUPER' },
  { pattern: /RTX\s*4070/i, model: 'RTX 4070' },
  { pattern: /RTX\s*4060\s*Ti/i, model: 'RTX 4060 Ti' },
  { pattern: /RTX\s*4060/i, model: 'RTX 4060' },

  // NVIDIA RTX 30 Series
  { pattern: /RTX\s*3090\s*Ti/i, model: 'RTX 3090 Ti' },
  { pattern: /RTX\s*3090/i, model: 'RTX 3090' },
  { pattern: /RTX\s*3080\s*Ti/i, model: 'RTX 3080 Ti' },
  { pattern: /RTX\s*3080/i, model: 'RTX 3080' },
  { pattern: /RTX\s*3070\s*Ti/i, model: 'RTX 3070 Ti' },
  { pattern: /RTX\s*3070/i, model: 'RTX 3070' },
  { pattern: /RTX\s*3060\s*Ti/i, model: 'RTX 3060 Ti' },
  { pattern: /RTX\s*3060/i, model: 'RTX 3060' },
  { pattern: /RTX\s*3050/i, model: 'RTX 3050' },

  // NVIDIA Professional
  { pattern: /RTX\s*PRO\s*6000/i, model: 'RTX PRO 6000' },
  { pattern: /RTX\s*PRO\s*4500/i, model: 'RTX PRO 4500' },
  { pattern: /RTX\s*PRO\s*4000/i, model: 'RTX PRO 4000' },
  { pattern: /RTX\s*PRO\s*2000/i, model: 'RTX PRO 2000' },
  { pattern: /RTX\s*A400/i, model: 'RTX A400' },
  { pattern: /RTX\s*A1000/i, model: 'RTX A1000' },

  // AMD RX 9000
  { pattern: /RX\s*9070\s*XT/i, model: 'RX 9070 XT' },
  { pattern: /RX\s*9070\s*GRE/i, model: 'RX 9070 GRE' },
  { pattern: /RX\s*9070/i, model: 'RX 9070' },
  { pattern: /RX\s*9060\s*XT/i, model: 'RX 9060 XT' },
  { pattern: /RX\s*9060/i, model: 'RX 9060' },

  // AMD RX 7000
  { pattern: /RX\s*7900\s*XTX/i, model: 'RX 7900 XTX' },
  { pattern: /RX\s*7900\s*XT/i, model: 'RX 7900 XT' },
  { pattern: /RX\s*7800\s*XT/i, model: 'RX 7800 XT' },
  { pattern: /RX\s*7700\s*XT/i, model: 'RX 7700 XT' },
  { pattern: /RX\s*7700/i, model: 'RX 7700' },
  { pattern: /RX\s*7600\s*XT/i, model: 'RX 7600 XT' },
  { pattern: /RX\s*7600/i, model: 'RX 7600' },

  // AMD RX 6000
  { pattern: /RX\s*6950\s*XT/i, model: 'RX 6950 XT' },
  { pattern: /RX\s*6900\s*XT/i, model: 'RX 6900 XT' },
  { pattern: /RX\s*6800\s*XT/i, model: 'RX 6800 XT' },
  { pattern: /RX\s*6800/i, model: 'RX 6800' },
  { pattern: /RX\s*6750\s*XT/i, model: 'RX 6750 XT' },
  { pattern: /RX\s*6700\s*XT/i, model: 'RX 6700 XT' },
  { pattern: /RX\s*6650\s*XT/i, model: 'RX 6650 XT' },
  { pattern: /RX\s*6600\s*XT/i, model: 'RX 6600 XT' },
  { pattern: /RX\s*6600/i, model: 'RX 6600' },

  // AMD RX 5000
  { pattern: /RX\s*5700\s*XT/i, model: 'RX 5700 XT' },
  { pattern: /RX\s*5700/i, model: 'RX 5700' },

  // AMD RX 500
  { pattern: /RX\s*580/i, model: 'RX 580' },
  { pattern: /RX\s*570/i, model: 'RX 570' },

  // AMD Entry Level
  { pattern: /RX\s*6500\s*XT/i, model: 'RX 6500 XT' },
  { pattern: /RX\s*6400/i, model: 'RX 6400' },

  // Intel Arc
  { pattern: /Arc\s*B\s*770/i, model: 'Arc B770' },
  { pattern: /Arc\s*B\s*580/i, model: 'Arc B580' },
  { pattern: /Arc\s*B\s*570/i, model: 'Arc B570' },
  { pattern: /Arc\s*A\s*770/i, model: 'Arc A770' },
  { pattern: /Arc\s*A\s*750/i, model: 'Arc A750' },
  { pattern: /Arc\s*A\s*580/i, model: 'Arc A580' },
  { pattern: /Arc\s*A\s*380/i, model: 'Arc A380' },

  // Intel Arc Pro
  { pattern: /Arc\s*Pro\s*B\s*70/i, model: 'Arc Pro B70' }
];

// ============================================================
// BRAND PATTERNS
// ============================================================

const BRAND_PATTERNS = [
  { pattern: /\bASUS\b/i, brand: 'ASUS' },
  { pattern: /\bMSI\b/i, brand: 'MSI' },
  { pattern: /\bGIGABYTE\b/i, brand: 'GIGABYTE' },
  { pattern: /\bZOTAC\b/i, brand: 'ZOTAC' },
  { pattern: /\bPNY\b/i, brand: 'PNY' },
  { pattern: /\bSAPPHIRE\b/i, brand: 'SAPPHIRE' },
  { pattern: /\bPOWERCOLOR\b/i, brand: 'POWERCOLOR' },
  { pattern: /\bXFX\b/i, brand: 'XFX' },
  { pattern: /\bASROCK\b/i, brand: 'ASROCK' },
  { pattern: /\bINNO3D\b/i, brand: 'INNO3D' },
  { pattern: /\bGALAXY\b/i, brand: 'GALAXY' },
  { pattern: /\bGALAX\b/i, brand: 'GALAX' },
  { pattern: /\bPALIT\b/i, brand: 'PALIT' },
  { pattern: /\bEVGA\b/i, brand: 'EVGA' },
  { pattern: /\bGAINWARD\b/i, brand: 'GAINWARD' },
  { pattern: /\bCOLORFUL\b/i, brand: 'COLORFUL' },
  { pattern: /\bSPARKLE\b/i, brand: 'SPARKLE' }
];

// ============================================================
// VARIANT PATTERNS
// ============================================================

const VARIANT_PATTERNS = [
  // ASUS
  { pattern: /ROG\s*STRIX/i, variant: 'ROG STRIX' },
  { pattern: /TUF\s*GAMING/i, variant: 'TUF GAMING' },
  { pattern: /DUAL\s*OC/i, variant: 'DUAL OC' },
  { pattern: /\bDUAL\b/i, variant: 'DUAL' },
  { pattern: /PRIME/i, variant: 'PRIME' },
  { pattern: /PROART/i, variant: 'PROART' },

  // MSI
  { pattern: /SUPRIM\s*X/i, variant: 'SUPRIM X' },
  { pattern: /\bSUPRIM\b/i, variant: 'SUPRIM' },
  { pattern: /GAMING\s*X\s*SLIM/i, variant: 'GAMING X SLIM' },
  { pattern: /GAMING\s*X\s*TRIO/i, variant: 'GAMING X TRIO' },
  { pattern: /GAMING\s*X/i, variant: 'GAMING X' },
  { pattern: /VENTUS\s*3X/i, variant: 'VENTUS 3X' },
  { pattern: /VENTUS\s*2X/i, variant: 'VENTUS 2X' },
  { pattern: /\bVENTUS\b/i, variant: 'VENTUS' },
  { pattern: /MECH\s*2X/i, variant: 'MECH 2X' },
  { pattern: /\bMECH\b/i, variant: 'MECH' },
  { pattern: /SHADOW\s*3X/i, variant: 'SHADOW 3X' },
  { pattern: /\bSHADOW\b/i, variant: 'SHADOW' },

  // GIGABYTE
  { pattern: /AORUS\s*MASTER/i, variant: 'AORUS MASTER' },
  { pattern: /AORUS\s*ELITE/i, variant: 'AORUS ELITE' },
  { pattern: /\bAORUS\b/i, variant: 'AORUS' },
  { pattern: /GAMING\s*OC/i, variant: 'GAMING OC' },
  { pattern: /\bWINDFORCE\b/i, variant: 'WINDFORCE' },

  // ZOTAC
  { pattern: /AMP\s*EXTREME/i, variant: 'AMP EXTREME' },
  { pattern: /AMP\s*AIRO/i, variant: 'AMP AIRO' },
  { pattern: /\bAMP\b/i, variant: 'AMP' },
  { pattern: /TWIN\s*EDGE/i, variant: 'TWIN EDGE' },

  // SAPPHIRE
  { pattern: /NITRO\+/i, variant: 'NITRO+' },
  { pattern: /PULSE/i, variant: 'PULSE' },

  // PowerColor
  { pattern: /HELLHOUND/i, variant: 'HELLHOUND' },
  { pattern: /RED\s*DEVIL/i, variant: 'RED DEVIL' },
  { pattern: /RED\s*DRAGON/i, variant: 'RED DRAGON' },

  // Generic
  { pattern: /\bOC\b/i, variant: 'OC' }
];

// ============================================================
// EXTRACT GPU MODEL
// ============================================================

function extractGpuModel(name) {
  if (!name) return null;

  for (const { pattern, model } of GPU_PATTERNS) {
    if (pattern.test(name)) return model;
  }

  return null;
}

// ============================================================
// EXTRACT BRAND
// ============================================================

function extractBrand(name) {
  if (!name) return 'Unknown';

  for (const { pattern, brand } of BRAND_PATTERNS) {
    if (pattern.test(name)) return brand;
  }

  return 'Unknown';
}

// ============================================================
// EXTRACT VRAM
// ============================================================

function extractVram(name) {
  if (!name) return null;

  const match = name.match(/(\d+)\s*GB/i);

  return match ? `${match[1]}GB` : null;
}

// ============================================================
// EXTRACT MEMORY TYPE
// ============================================================

function extractMemoryType(name) {
  if (!name) return null;

  const match = name.match(/GDDR\d+X?/i);

  return match ? match[0].toUpperCase() : null;
}

// ============================================================
// EXTRACT VARIANT
// ============================================================

function extractVariant(name) {
  if (!name) return null;

  for (const { pattern, variant } of VARIANT_PATTERNS) {
    if (pattern.test(name)) return variant;
  }

  return null;
}

// ============================================================
// EXTRACT MODEL NUMBER
// ============================================================

function extractModelNumber(name) {
  if (!name) return null;

  const match = name.match(
    /([A-Z]{2,}-[A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)?)/i
  );

  return match ? match[1].toUpperCase() : null;
}

// ============================================================
// NORMALIZE VALUE
// ============================================================

function normalizeValue(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();
}

// ============================================================
// BUILD MATCH KEY
// ============================================================

function buildMatchKey(
  name,
  {
    gpuModel,
    brand,
    variant,
    vram
  } = {}
) {
  const normalizedBrand = normalizeValue(
    brand ||
    extractBrand(name) ||
    'UNKNOWN'
  );

  const normalizedGpu = normalizeValue(
    gpuModel ||
    extractGpuModel(name) ||
    'UNKNOWN'
  );

  const normalizedVariant = normalizeValue(
    variant ||
    extractVariant(name) ||
    ''
  );

  const normalizedVram = normalizeValue(
    vram ||
    extractVram(name) ||
    ''
  );

  return [
    normalizedBrand,
    normalizedGpu,
    normalizedVariant,
    normalizedVram
  ].join('|');
}

// ============================================================
// PRICE VALIDATION
// ============================================================

function validatePrice(price) {
  if (
    price === null ||
    price === undefined
  ) {
    return null;
  }

  const number =
    typeof price === 'string'
      ? parseFloat(
          price.replace(/[฿,\s]/g, '')
        )
      : Number(price);

  if (isNaN(number)) {
    return null;
  }

  if (number <= 0) {
    return null;
  }

  if (number > 9999999) {
    return null;
  }

  return number;
}

// ============================================================
// IMAGE VALIDATION
// ============================================================

function isValidImageUrl(imageUrl) {
  if (
    !imageUrl ||
    typeof imageUrl !== 'string'
  ) {
    return false;
  }

  const value = imageUrl.trim();

  if (!value) {
    return false;
  }

  const upper = value.toUpperCase();

  // ป้องกันรูปโปรโมชั่น / placeholder
  if (
    upper.includes('ECOM_LABEL') ||
    upper.includes('PLACEHOLDER') ||
    upper.includes('NO-IMAGE') ||
    upper.includes('NO_IMAGE') ||
    upper.includes('NOIMAGE')
  ) {
    return false;
  }

  // ไม่รับ Data URL
  if (
    value.startsWith('data:image/')
  ) {
    return false;
  }

  return true;
}
// ============================================================
// IMAGE VALIDATION
// ============================================================

function isValidImageUrl(imageUrl) {
  if (
    !imageUrl ||
    typeof imageUrl !== 'string'
  ) {
    return false;
  }

  const value = imageUrl.trim();

  if (!value) {
    return false;
  }

  const upper = value.toUpperCase();

  // ป้องกันรูปโปรโมชั่น / placeholder
  if (
    upper.includes('ECOM_LABEL') ||
    upper.includes('PLACEHOLDER') ||
    upper.includes('NO-IMAGE') ||
    upper.includes('NO_IMAGE') ||
    upper.includes('NOIMAGE')
  ) {
    return false;
  }

  // ไม่รับ Data URL
  if (
    value.startsWith('data:image/')
  ) {
    return false;
  }

  return true;
}


// ============================================================
// UPDATE PRODUCT IMAGE
// ============================================================

async function updateProductImage(
  productId,
  imageUrl
) {
  if (!productId) {
    return;
  }

  if (!isValidImageUrl(imageUrl)) {
    return;
  }

  try {
    await pool.execute(
      `
      UPDATE products
      SET image_url = ?
      WHERE id = ?
      `,
      [
        imageUrl.trim(),
        productId
      ]
    );

  } catch (error) {
    console.error(
      'updateProductImage error:',
      error.message
    );
  }
}


// ============================================================
// FIND UNKNOWN BRAND MATCH
// ============================================================
// ============================================================
// UPDATE PRODUCT IMAGE
// ============================================================

async function updateProductImage(
  productId,
  imageUrl
) {
  if (!productId) {
    return;
  }

  if (!isValidImageUrl(imageUrl)) {
    return;
  }

  try {
    await pool.execute(
      `
      UPDATE products
      SET image_url = ?
      WHERE id = ?
      `,
      [
        imageUrl.trim(),
        productId
      ]
    );
  } catch (error) {
    console.error(
      'updateProductImage error:',
      error.message
    );
  }
}

// ============================================================
// FIND UNKNOWN BRAND MATCH
// ============================================================

async function findUnknownBrandMatch({
  gpuModel,
  variant,
  vram,
  brand
}) {
  // ถ้าแบรนด์ใหม่เป็น Unknown
  // ห้ามเดาสุ่ม
  if (
    !brand ||
    brand === 'Unknown'
  ) {
    return null;
  }

  try {
    /*
     * กรณีสำคัญ:
     *
     * DB เดิม:
     * Unknown | Arc B570 | OC | 10GB
     *
     * ข้อมูลใหม่:
     * SPARKLE | Arc B570 | OC | 10GB
     *
     * ให้ถือว่าเป็นรายการเดิม
     */

    const [rows] = await pool.execute(
      `
      SELECT
        id,
        brand,
        gpu_model,
        variant,
        vram,
        match_key
      FROM products
      WHERE
        (
          brand IS NULL
          OR brand = ''
          OR brand = 'Unknown'
        )
        AND gpu_model = ?
        AND (
          variant = ?
          OR (variant IS NULL AND ? IS NULL)
        )
        AND (
          vram = ?
          OR (vram IS NULL AND ? IS NULL)
        )
      ORDER BY id ASC
      LIMIT 1
      `,
      [
        gpuModel,
        variant,
        variant,
        vram,
        vram
      ]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0];

  } catch (error) {
    console.error(
      'findUnknownBrandMatch error:',
      error.message
    );

    return null;
  }
}

// ============================================================
// UPGRADE UNKNOWN BRAND
// ============================================================

async function upgradeUnknownBrand(
  productId,
  {
    brand,
    gpuModel,
    variant,
    vram
  }
) {
  const matchKey = buildMatchKey(
    '',
    {
      brand,
      gpuModel,
      variant,
      vram
    }
  );

  try {
    await pool.execute(
      `
      UPDATE products
      SET
        brand = ?,
        gpu_model = ?,
        variant = ?,
        vram = ?,
        match_key = ?
      WHERE id = ?
      `,
      [
        brand,
        gpuModel,
        variant,
        vram,
        matchKey,
        productId
      ]
    );

  } catch (error) {
    console.error(
      'upgradeUnknownBrand error:',
      error.message
    );
  }
}

// ============================================================
// MATCH PRODUCT
// ============================================================

async function matchProduct(
  scraperProduct
) {
  if (
    !scraperProduct ||
    !scraperProduct.name
  ) {
    return null;
  }

  const name =
    scraperProduct.name;

  const gpuModel =
    scraperProduct.gpuModel ||
    extractGpuModel(name);

  const brand =
    scraperProduct.brand ||
    extractBrand(name);

  const variant =
    scraperProduct.variant ||
    extractVariant(name);

  const vram =
    scraperProduct.vram ||
    extractVram(name);

  if (!gpuModel) {
    return null;
  }

  // ==========================================================
  // 1. MODEL NUMBER
  // ==========================================================

  const modelNumber =
    scraperProduct.modelNumber ||
    extractModelNumber(name);

  if (modelNumber) {
    try {
      const [rows] =
        await pool.execute(
          `
          SELECT id
          FROM products
          WHERE model_number = ?
          LIMIT 1
          `,
          [modelNumber]
        );

      if (rows.length > 0) {
        const productId =
          rows[0].id;

        // อัปเดตรูปจากร้านทันที
        await updateProductImage(
          productId,
          scraperProduct.imageUrl
        );

        return productId;
      }

    } catch (error) {
      console.error(
        'modelNumber match error:',
        error.message
      );
    }
  }

  // ==========================================================
  // 2. EXACT MATCH KEY
  // ==========================================================

  const matchKey =
    buildMatchKey(
      name,
      {
        gpuModel,
        brand,
        variant,
        vram
      }
    );

  try {
    const [rows] =
      await pool.execute(
        `
        SELECT id
        FROM products
        WHERE match_key = ?
        LIMIT 1
        `,
        [matchKey]
      );

    if (rows.length > 0) {
      const productId =
        rows[0].id;

      // อัปเดตรูปจากร้านทันที
      await updateProductImage(
        productId,
        scraperProduct.imageUrl
      );

      return productId;
    }

  } catch (error) {
    console.error(
      'matchKey error:',
      error.message
    );
  }

  // ==========================================================
  // 3. UNKNOWN BRAND MATCH
  // ==========================================================

  const unknownMatch =
    await findUnknownBrandMatch(
      {
        gpuModel,
        variant,
        vram,
        brand
      }
    );

  if (unknownMatch) {
    const productId =
      unknownMatch.id;

    // เปลี่ยน Unknown -> Brand จริง
    await upgradeUnknownBrand(
      productId,
      {
        brand,
        gpuModel,
        variant,
        vram
      }
    );

    // อัปเดตรูป
    await updateProductImage(
      productId,
      scraperProduct.imageUrl
    );

    return productId;
  }

  // ==========================================================
  // ไม่พบสินค้าเดิม
  // ==========================================================

  return null;
}

// ============================================================
// CREATE PRODUCT
// ============================================================

async function createProduct(
  scraperProduct
) {
  const name =
    scraperProduct.name;

  const gpuModel =
    scraperProduct.gpuModel ||
    extractGpuModel(name) ||
    'Unknown';

  const brand =
    scraperProduct.brand ||
    extractBrand(name);

  const variant =
    scraperProduct.variant ||
    extractVariant(name);

  const vram =
    scraperProduct.vram ||
    extractVram(name);

  const memoryType =
    scraperProduct.memoryType ||
    extractMemoryType(name);

  const modelNumber =
    scraperProduct.modelNumber ||
    extractModelNumber(name);

  const imageUrl =
    isValidImageUrl(
      scraperProduct.imageUrl
    )
      ? scraperProduct.imageUrl.trim()
      : null;

  const matchKey =
    buildMatchKey(
      name,
      {
        gpuModel,
        brand,
        variant,
        vram
      }
    );

  const [result] =
    await pool.execute(
      `
      INSERT INTO products
      (
        name,
        brand,
        gpu_model,
        variant,
        vram,
        memory_type,
        image_url,
        model_number,
        match_key
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        brand,
        gpuModel,
        variant,
        vram,
        memoryType,
        imageUrl,
        modelNumber,
        matchKey
      ]
    );

  return result.insertId;
}

// ============================================================
// UPSERT PRICE
// ============================================================

async function upsertPrice(
  productId,
  storeId,
  priceData
) {
  const {
    price,
    productUrl,
    availability = 'available',
    scrapedAt
  } = priceData;

  const validatedPrice =
    validatePrice(price);

  const scrapedAtValue =
    scrapedAt
      ? new Date(scrapedAt)
      : new Date();

  let oldPrice = null;

  // ==========================================================
  // OLD PRICE
  // ==========================================================

  try {
    const [[existing]] =
      await pool.execute(
        `
        SELECT price
        FROM prices
        WHERE
          product_id = ?
          AND store_id = ?
        `,
        [
          productId,
          storeId
        ]
      );

    if (existing) {
      oldPrice =
        parseFloat(
          existing.price
        );
    }

  } catch (_) {
    // ไม่ให้ระบบหยุดถ้า query ราคาเดิมมีปัญหา
  }

  // ==========================================================
  // UPSERT CURRENT PRICE
  // ==========================================================

  await pool.execute(
    `
    INSERT INTO prices
    (
      product_id,
      store_id,
      price,
      product_url,
      availability,
      scraped_at
    )
    VALUES (?, ?, ?, ?, ?, ?)

    ON DUPLICATE KEY UPDATE

      price = VALUES(price),

      product_url =
        VALUES(product_url),

      availability =
        VALUES(availability),

      scraped_at =
        VALUES(scraped_at),

      updated_at =
        CURRENT_TIMESTAMP
    `,
    [
      productId,
      storeId,
      validatedPrice,
      productUrl,
      availability,
      scrapedAtValue
    ]
  );

  // ==========================================================
  // PRICE HISTORY
  // ==========================================================

  const priceChanged =
    oldPrice === null ||
    (
      validatedPrice !== null &&
      validatedPrice !== oldPrice
    );

  if (
    priceChanged &&
    validatedPrice !== null
  ) {
    await pool.execute(
      `
      INSERT INTO price_history
      (
        product_id,
        store_id,
        price,
        recorded_at
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        productId,
        storeId,
        validatedPrice,
        scrapedAtValue
      ]
    );
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  extractGpuModel,
  extractBrand,
  extractVram,
  extractMemoryType,
  extractVariant,
  extractModelNumber,
  buildMatchKey,
  validatePrice,
  matchProduct,
  updateProductImage,
  createProduct,
  upsertPrice
};