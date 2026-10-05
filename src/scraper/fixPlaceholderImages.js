/**
 * fixPlaceholderImages.js
 *
 * แก้ GPU ที่ image_url เป็น placeholder
 * โดยเข้าไปเปิด product URL จาก prices
 * แล้วค้นหารูปจริงจาก:
 *
 * - og:image
 * - img src
 * - data-src
 * - data-original
 * - data-lazy-src
 * - data-image
 * - srcset
 */

require('dotenv').config();

const { chromium } = require('playwright');
const { pool } = require('../config/database');


// ============================================================
// CONFIG
// ============================================================

const PLACEHOLDER_WORDS = [
  'placeholder',
  'gpu-placeholder',
  'no-image',
  'no_image',
  'noimage',
  'ecom_label'
];


// ============================================================
// IMAGE VALIDATION
// ============================================================

function isValidImageUrl(url) {

  if (!url || typeof url !== 'string') {
    return false;
  }

  const value = url.trim();

  if (!value) {
    return false;
  }

  const lower = value.toLowerCase();

  // ไม่เอ placeholder
  for (const word of PLACEHOLDER_WORDS) {
    if (lower.includes(word)) {
      return false;
    }
  }

  // ไม่เอ data:image
  if (lower.startsWith('data:image')) {
    return false;
  }

  // ไม่เอ svg
  if (lower.startsWith('data:image/svg')) {
    return false;
  }

  return true;
}


// ============================================================
// MAKE ABSOLUTE URL
// ============================================================

function makeAbsoluteUrl(url, baseUrl) {

  if (!url || typeof url !== 'string') {
    return null;
  }

  const value = url.trim();

  if (!value) {
    return null;
  }

  try {

    return new URL(
      value,
      baseUrl
    ).href;

  } catch (_) {

    return null;
  }
}


// ============================================================
// EXTRACT URL FROM IMAGE ELEMENT
// ============================================================

async function extractImagesFromPage(page) {

  return await page.locator('img').evaluateAll(imgs => {

    const results = [];

    for (const img of imgs) {

      const attributes = [
        'src',
        'data-src',
        'data-original',
        'data-lazy-src',
        'data-image',
        'data-image-url',
        'data-original-src',
        'data-lazy',
        'data-url'
      ];

      for (const attr of attributes) {

        const value = img.getAttribute(attr);

        if (value) {
          results.push(value);
        }
      }


      // srcset
      const srcset =
        img.getAttribute('srcset');

      if (srcset) {

        const parts =
          srcset.split(',');

        for (const part of parts) {

          const url =
            part.trim().split(/\s+/)[0];

          if (url) {
            results.push(url);
          }
        }
      }


      // current src
      if (img.currentSrc) {
        results.push(img.currentSrc);
      }

    }

    return results;

  });

}


// ============================================================
// FIND PRODUCT IMAGE
// ============================================================

async function findProductImage(page, pageUrl) {

  const candidates = [];


  // ----------------------------------------------------------
  // 1. OG IMAGE
  // ----------------------------------------------------------

  const ogImage =
    await page
      .locator('meta[property="og:image"]')
      .getAttribute('content')
      .catch(() => null);

  if (ogImage) {
    candidates.push(ogImage);
  }


  // ----------------------------------------------------------
  // 2. Twitter image
  // ----------------------------------------------------------

  const twitterImage =
    await page
      .locator('meta[name="twitter:image"]')
      .getAttribute('content')
      .catch(() => null);

  if (twitterImage) {
    candidates.push(twitterImage);
  }


  // ----------------------------------------------------------
  // 3. IMG
  // ----------------------------------------------------------

  const images =
    await extractImagesFromPage(page);

  candidates.push(...images);


  // ----------------------------------------------------------
  // ตรวจสอบรูปทั้งหมด
  // ----------------------------------------------------------

  for (const candidate of candidates) {

    const absoluteUrl =
      makeAbsoluteUrl(
        candidate,
        pageUrl
      );

    if (!absoluteUrl) {
      continue;
    }

    if (!isValidImageUrl(absoluteUrl)) {
      continue;
    }

    // ป้องกัน logo / icon / banner
    const lower =
      absoluteUrl.toLowerCase();

    if (
      lower.includes('logo') ||
      lower.includes('icon') ||
      lower.includes('favicon') ||
      lower.includes('banner')
    ) {
      continue;
    }

    return absoluteUrl;
  }


  return null;
}


// ============================================================
// GET PLACEHOLDER PRODUCTS
// ============================================================

async function getPlaceholderProducts() {

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      name,
      image_url
    FROM products
    WHERE
      LOWER(image_url) LIKE '%placeholder%'
      OR LOWER(image_url) LIKE '%no-image%'
      OR LOWER(image_url) LIKE '%no_image%'
      OR LOWER(image_url) LIKE '%noimage%'
    ORDER BY id ASC
    `
  );

  return rows;
}


// ============================================================
// GET STORE URLS
// ============================================================

async function getProductUrls(productId) {

  const [rows] = await pool.execute(
    `
    SELECT
      s.name AS store_name,
      pr.product_url
    FROM prices pr
    LEFT JOIN stores s
      ON s.id = pr.store_id
    WHERE
      pr.product_id = ?
      AND pr.product_url IS NOT NULL
      AND pr.product_url <> ''
    ORDER BY
      CASE
        WHEN LOWER(s.name) = 'jib'
          THEN 1

        WHEN LOWER(s.name) = 'ihavecpu'
          THEN 2

        WHEN LOWER(s.name) = 'banana'
          THEN 3

        ELSE 4
      END
    `,
    [productId]
  );

  return rows;
}


// ============================================================
// UPDATE IMAGE
// ============================================================

async function updateProductImage(
  productId,
  imageUrl
) {

  if (!isValidImageUrl(imageUrl)) {
    return false;
  }

  await pool.execute(
    `
    UPDATE products
    SET image_url = ?
    WHERE id = ?
    `,
    [
      imageUrl,
      productId
    ]
  );

  return true;
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log('');
  console.log('==============================================');
  console.log(' FIX GPU PLACEHOLDER IMAGES');
  console.log('==============================================');
  console.log('');


  const products =
    await getPlaceholderProducts();


  console.log(
    `[INFO] Placeholder products: ${products.length}`
  );


  if (products.length === 0) {

    console.log(
      '[SUCCESS] ไม่มี Placeholder'
    );

    await pool.end();

    return;
  }


  const browser =
    await chromium.launch({
      headless: true
    });


  const context =
    await browser.newContext({
      viewport: {
        width: 1366,
        height: 768
      }
    });


  const page =
    await context.newPage();


  // ----------------------------------------------------------
  // PROCESS PRODUCTS
  // ----------------------------------------------------------

  for (const product of products) {

    console.log('');
    console.log('==============================================');
    console.log(
      `[PRODUCT ${product.id}] ${product.name}`
    );
    console.log('==============================================');


    const urls =
      await getProductUrls(product.id);


    if (urls.length === 0) {

      console.log(
        '[WARN] ไม่มี product URL'
      );

      continue;
    }


    let found = false;


    // --------------------------------------------------------
    // ลอง URL ร้านทีละร้าน
    // --------------------------------------------------------

    for (const item of urls) {

      if (found) {
        break;
      }


      console.log(
        `[STORE] ${item.store_name || 'Unknown'}`
      );

      console.log(
        `[URL] ${item.product_url}`
      );


      try {

        await page.goto(
          item.product_url,
          {
            waitUntil: 'domcontentloaded',
            timeout: 45000
          }
        );


        // รอ JS / Lazy Load
        await page.waitForTimeout(2500);


        // scroll เพื่อ trigger lazy loading
        await page.evaluate(async () => {

          window.scrollTo(
            0,
            document.body.scrollHeight
          );

          await new Promise(
            resolve =>
              setTimeout(resolve, 1000)
          );

          window.scrollTo(
            0,
            0
          );

        });


        await page.waitForTimeout(1000);


        const imageUrl =
          await findProductImage(
            page,
            item.product_url
          );


        if (!imageUrl) {

          console.log(
            '[WARN] ไม่พบรูปจริงจากร้านนี้'
          );

          continue;
        }


        console.log(
          `[FOUND IMAGE] ${imageUrl}`
        );


        const updated =
          await updateProductImage(
            product.id,
            imageUrl
          );


        if (updated) {

          console.log(
            '[SUCCESS] อัปเดตรูปแล้ว'
          );

          found = true;
        }


      } catch (error) {

        console.log(
          `[ERROR] ${error.message}`
        );

      }

    }


    if (!found) {

      console.log(
        '[FAILED] ยังหารูปจริงไม่ได้'
      );

    }

  }


  await browser.close();
  await pool.end();


  console.log('');
  console.log('==============================================');
  console.log(' FINISHED');
  console.log('==============================================');
}


// ============================================================
// START
// ============================================================

main().catch(error => {

  console.error('');
  console.error('[FATAL]');
  console.error(error);
  console.error('');

  process.exit(1);

});