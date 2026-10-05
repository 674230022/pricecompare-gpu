/**
 * banana.js - BaNANA IT Scraper
 * เว็บไซต์: https://www.bnn.in.th
 *
 * ดึงสินค้า Graphic Card (VGA)
 *
 * IMAGE RULE:
 * - ใช้เฉพาะรูปที่ alt ระบุว่าเป็น GPU
 * - ไม่ใช้รูป "ผ่อน 0%"
 * - ไม่ใช้รูป ECOM_LABEL
 * - ถ้าหาภาพสินค้าไม่เจอ ให้ imageUrl = null
 *   ดีกว่าเอารูปมั่วมาแสดง
 */

const { BaseScraper } = require('./baseScraper');
const { extractGpuModel } = require('../utils/productMatcher');
const logger = require('../utils/logger');

const GPU_KEYWORDS = [
  'RTX',
  'RX ',
  'RADEON',
  'GEFORCE',
  'ARC '
];

class BananaScraper extends BaseScraper {
  constructor() {
    super('BaNANA', 3);
  }

  async scrape() {
    const products = [];

    const url =
      'https://www.bnn.in.th/th/p/computer-hardware-diy/graphic-card-computer-hardware-diy';

    logger.scraper(
      `[BaNANA] Navigating to: ${url}`
    );

    await this._goto(url);

    await this._delay(3000);

    // Scroll เพื่อให้ข้อมูล lazy-load โหลด
    await this.page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);

      await new Promise(resolve =>
        setTimeout(resolve, 1500)
      );

      window.scrollTo(0, 0);
    });

    await this._delay(2000);

    /*
     * BaNANA ปัจจุบัน:
     * สินค้าอยู่ใน <a>
     * โดย text ของ <a> มีชื่อ + รายละเอียด + ราคา
     *
     * ใน <a> เดียวกันอาจมี:
     * - รูปสินค้า
     * - รูปผ่อน 0%
     *
     * ดังนั้นห้ามใช้ img ตัวแรก
     */

    const items = await this.page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const links = Array.from(
        document.querySelectorAll('a')
      );

      for (const link of links) {
        const text = (
          link.innerText || ''
        ).trim();

        const href = link.href;

        if (!text || !href) {
          continue;
        }

        const upper = text.toUpperCase();

        // ตรวจว่าเป็น GPU หรือไม่
        const isGpu =
          upper.includes('RTX') ||
          upper.includes('RX ') ||
          upper.includes('RADEON') ||
          upper.includes('GEFORCE') ||
          upper.includes('ARC ');

        if (!isGpu) {
          continue;
        }

        // ต้องเป็น link สินค้า
        if (!href.includes('/th/p/')) {
          continue;
        }

        // ป้องกัน URL ซ้ำ
        if (seen.has(href)) {
          continue;
        }

        // =====================================================
        // หา PRICE
        // =====================================================

        const priceMatches = text.match(
          /฿\s*[\d,]+(?:\.\d{2})?/g
        );

        const price = priceMatches
          ? priceMatches[0]
          : null;

        // =====================================================
        // หา NAME
        // =====================================================

        const lines = text
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean);

        let name = lines.find(line =>
          line.includes('การ์ดจอ')
        );

        // fallback
        if (!name) {
          name = lines.find(line =>
            /RTX|RX |RADEON|GEFORCE|ARC /i.test(line)
          );
        }

        if (!name) {
          continue;
        }

        // =====================================================
        // หา IMAGE
        // =====================================================

        const images = Array.from(
          link.querySelectorAll('img')
        );

        let imageUrl = null;

        /*
         * เลือกเฉพาะรูปที่ alt บอกว่าเป็น GPU
         *
         * ตัวอย่างที่ต้องการ:
         * "การ์ดจอ GALAX GeForce RTX 5060..."
         *
         * ตัวอย่างที่ไม่ต้องการ:
         * "ผ่อน 0%"
         */

        const productImage = images.find(img => {
          const alt = (
            img.getAttribute('alt') || ''
          ).trim();

          const src =
            img.getAttribute('src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            '';

          const altUpper =
            alt.toUpperCase();

          const srcUpper =
            src.toUpperCase();

          // ไม่มี alt → ไม่เอา
          if (!alt) {
            return false;
          }

          // ห้ามรูปโปรโมชั่น
          if (
            altUpper.includes('ผ่อน') ||
            altUpper.includes('0%') ||
            srcUpper.includes('ECOM_LABEL')
          ) {
            return false;
          }

          // ต้องเป็นรูปที่ระบุว่าเป็น GPU
          return (
            altUpper.includes('RTX') ||
            altUpper.includes('RX ') ||
            altUpper.includes('RADEON') ||
            altUpper.includes('GEFORCE') ||
            altUpper.includes('ARC ')
          );
        });

        if (productImage) {
          imageUrl =
            productImage.getAttribute('src') ||
            productImage.getAttribute('data-src') ||
            productImage.getAttribute('data-lazy-src') ||
            null;
        }

        // =====================================================
        // เก็บข้อมูล
        // =====================================================

        seen.add(href);

        results.push({
          name,
          price,
          href,
          img: imageUrl
        });
      }

      return results;
    });

    logger.scraper(
      `[BaNANA] Found ${items.length} possible GPU products`
    );

    // ============================================================
    // FILTER + VALIDATE
    // ============================================================

    for (const item of items) {
      const upperName =
        item.name.toUpperCase();

      const isGpu =
        GPU_KEYWORDS.some(keyword =>
          upperName.includes(keyword)
        );

      if (!isGpu) {
        continue;
      }

      // ตรวจ GPU Model
      const gpuModel =
        extractGpuModel(item.name);

      if (!gpuModel) {
        logger.warn(
          `[BaNANA] Could not extract GPU model: ${item.name}`
        );

        continue;
      }

      // ตรวจราคา
      const price =
        this._parsePrice(item.price);

      if (!price || price <= 0) {
        logger.warn(
          `[BaNANA] Invalid price: ${item.name} | ${item.price}`
        );

        continue;
      }

      // =====================================================
      // SAVE PRODUCT
      // =====================================================

      products.push({
        name: item.name,
        price,
        productUrl: item.href,

        // ถ้าหาภาพจริงไม่ได้ จะเป็น null
        imageUrl: item.img || null,

        availability: 'available'
      });

      logger.scraper(
        `[BaNANA] PRODUCT ${item.name}`
      );

      logger.scraper(
        `[BaNANA] PRICE ${price}`
      );

      logger.scraper(
        `[BaNANA] IMAGE ${item.img || 'NULL'}`
      );
    }

    // ============================================================
    // ป้องกัน URL ซ้ำ
    // ============================================================

    const uniqueProducts = [];
    const seenUrls = new Set();

    for (const product of products) {
      if (!product.productUrl) {
        continue;
      }

      if (seenUrls.has(product.productUrl)) {
        continue;
      }

      seenUrls.add(product.productUrl);

      uniqueProducts.push(product);
    }

    logger.scraper(
      `[BaNANA] Filtered to ${uniqueProducts.length} GPU products`
    );

    return uniqueProducts;
  }
}

module.exports = BananaScraper;