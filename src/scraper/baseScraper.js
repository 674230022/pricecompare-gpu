/**
 * baseScraper.js - Base Scraper Class
 *
 * กฎสำคัญ:
 * - ไม่ Bypass CAPTCHA
 * - ไม่ใช้ Proxy Rotation
 * - ถ้าพบ 403/429/CAPTCHA ให้หยุดร้านนั้นในรอบนั้น
 * - Request น้อยและสุภาพ
 * - มี Timeout และ Retry จำกัด
 */

const { chromium }  = require('playwright');
const logger        = require('../utils/logger');
const { pool }      = require('../config/database');
const { matchProduct, createProduct, upsertPrice } = require('../utils/productMatcher');

// ── Config จาก .env ──────────────────────────────────────
const TIMEOUT_MS  = (parseInt(process.env.SCRAPE_TIMEOUT_SECONDS)  || 30) * 1000;
const MAX_RETRIES = parseInt(process.env.SCRAPE_MAX_RETRIES) || 2;
const DELAY_MS    = (parseInt(process.env.SCRAPE_DELAY_SECONDS)    || 5)  * 1000;

class BaseScraper {
  /**
   * @param {string} storeName  - ชื่อร้านค้า เช่น 'JIB'
   * @param {number} storeId    - ID ในตาราง stores
   */
  constructor(storeName, storeId) {
    this.storeName = storeName;
    this.storeId   = storeId;
    this.browser   = null;
    this.page      = null;
  }

  // ─────────────────────────────────────────────────────
  // Public: รัน scraper ทั้งกระบวนการ
  // ─────────────────────────────────────────────────────
  async run() {
    logger.scraper(`[${this.storeName}] Starting scrape...`);
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        await this._launchBrowser();
        const products = await this.scrape();

        if (!products || products.length === 0) {
          throw new Error('No products found');
        }

        // บันทึกข้อมูลลง Database
        const saved = await this._saveProducts(products);

        await logger.saveScraperLog(
          this.storeId, 'success',
          `Scraped ${saved} products successfully`,
          saved
        );
        logger.success(`[${this.storeName}] Saved ${saved} products`);
        return { success: true, count: saved };

      } catch (err) {
        attempt++;

        // ตรวจสอบ error ที่ควรหยุดทันที (ไม่ retry)
        if (this._isFatalError(err.message)) {
          logger.warn(`[${this.storeName}] Fatal error (no retry): ${err.message}`);
          await logger.saveScraperLog(this.storeId, 'skipped', err.message, 0);
          return { success: false, error: err.message, fatal: true };
        }

        logger.warn(`[${this.storeName}] Attempt ${attempt}/${MAX_RETRIES + 1} failed: ${err.message}`);

        if (attempt > MAX_RETRIES) {
          await logger.saveScraperLog(this.storeId, 'error', err.message, 0);
          return { success: false, error: err.message };
        }

        // รอก่อน retry
        await this._delay(DELAY_MS);
      } finally {
        await this._closeBrowser();
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // Abstract: แต่ละร้านต้อง override เมธอดนี้
  // ต้อง return array ของ { name, price, productUrl, imageUrl? }
  // ─────────────────────────────────────────────────────
  async scrape() {
    throw new Error(`scrape() must be implemented by ${this.storeName}`);
  }

  // ─────────────────────────────────────────────────────
  // Protected Helpers
  // ─────────────────────────────────────────────────────

  /** เปิด Browser แบบ headless */
  async _launchBrowser() {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await this.browser.newContext({
      userAgent:   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale:      'th-TH',
      timezoneId:  'Asia/Bangkok',
      viewport:    { width: 1280, height: 900 },
    });
    this.page = await context.newPage();
    this.page.setDefaultTimeout(TIMEOUT_MS);
  }

  /** ปิด Browser */
  async _closeBrowser() {
    try {
      if (this.browser) await this.browser.close();
    } catch (_) {}
    this.browser = null;
    this.page    = null;
  }

  /**
   * Navigate และตรวจสอบ status code
   * ถ้าพบ 403/429 ให้โยน error เพื่อหยุดร้านนั้น
   */
  async _goto(url, options = {}) {
    const response = await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout:   TIMEOUT_MS,
      ...options,
    });

    if (!response) throw new Error('No response received');

    const status = response.status();
    if (status === 403) throw new Error('HTTP 403 Forbidden — ถูกบล็อก');
    if (status === 429) throw new Error('HTTP 429 Too Many Requests — Rate limited');
    if (status >= 500) throw new Error(`HTTP ${status} Server Error`);

    // ตรวจสอบ CAPTCHA ใน page content
    const bodyText = await this.page.evaluate(() => document.body?.innerText || '');
    if (this._hasCaptcha(bodyText)) {
      throw new Error('CAPTCHA detected — หยุดการดึงข้อมูลร้านนี้');
    }

    return response;
  }

  /** ตรวจสอบ Fatal Error ที่ไม่ควร retry */
  _isFatalError(message = '') {
    const fatalKeywords = [
      '403', '429', 'CAPTCHA', 'บล็อก', 'Rate limit', 'Forbidden',
      'Too Many Requests', 'captcha', 'blocked',
    ];
    return fatalKeywords.some(kw => message.includes(kw));
  }

  /** ตรวจสอบ CAPTCHA ใน page body */
  _hasCaptcha(text = '') {
    const patterns = [
      /captcha/i, /robot/i, /human verification/i, /cf-browser-verification/i,
      /access denied/i, /กรุณายืนยัน/i,
    ];
    return patterns.some(p => p.test(text));
  }

  /** หน่วงเวลา (ms) */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** แปลงราคาจาก text เป็น number (ลบ ฿, ,) */
  _parsePrice(text = '') {
    if (!text) return null;
    const cleaned = text.replace(/[฿,\s]/g, '').trim();
    const num     = parseFloat(cleaned);
    return isNaN(num) || num <= 0 ? null : num;
  }

  // ─────────────────────────────────────────────────────
  // บันทึกสินค้าลง Database
  // ─────────────────────────────────────────────────────
  async _saveProducts(products) {
    let savedCount = 0;
    const scrapedAt = new Date(); // timestamp เดียวกันทั้ง batch

    for (const item of products) {
      try {
        // ตรวจสอบข้อมูลขั้นต่ำ
        if (!item.name || !item.productUrl) {
          logger.warn(`[${this.storeName}] SKIP — missing name or URL`);
          continue;
        }

        // ตรวจสอบราคาก่อนบันทึก
        const { validatePrice } = require('../utils/productMatcher');
        const validPrice = validatePrice(item.price);

        // จับคู่กับ product ที่มีอยู่ หรือสร้างใหม่
        let productId = await matchProduct(item);
        if (!productId) {
          productId = await createProduct(item);
          logger.scraper(`[${this.storeName}] NEW product: ${item.name}`);
        }

        // upsert ราคา
        if (validPrice !== null) {
          await upsertPrice(productId, this.storeId, {
            price:        validPrice,
            productUrl:   item.productUrl,
            availability: item.availability || 'available',
            scrapedAt:    scrapedAt,
          });

          // Structured log ตาม spec
          logger.scraper(`[${this.storeName}] [PRODUCT] ${item.name}`);
          logger.scraper(`[${this.storeName}] [PRICE]   ${validPrice}`);
          logger.scraper(`[${this.storeName}] [URL]     ${item.productUrl}`);
          logger.scraper(`[${this.storeName}] [STATUS]  SUCCESS`);
          logger.scraper(`[${this.storeName}] [TIME]    ${scrapedAt.toISOString()}`);
          savedCount++;
        } else {
          logger.warn(`[${this.storeName}] [PRODUCT] ${item.name}`);
          logger.warn(`[${this.storeName}] [STATUS]  FAILED — PRICE_NOT_FOUND (raw: ${item.price})`);
        }

        // หน่วงเวลาเล็กน้อยระหว่างสินค้า (สุภาพ)
        await this._delay(300);
      } catch (err) {
        logger.warn(`[${this.storeName}] [STATUS] ERROR — ${item.name}: ${err.message}`);
      }
    }

    return savedCount;
  }
}

module.exports = { BaseScraper, TIMEOUT_MS, DELAY_MS };
