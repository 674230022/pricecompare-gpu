/**
 * testRun.js — ONE-SHOT Scraper Test Run
 *
 * ขั้นตอน:
 *  1. Scrape GPU list จาก JIB → เลือก 4 SKU ที่มีข้อมูลชัดเจน
 *  2. ค้นหา SKU เดียวกัน (match_key) ใน Advice, BaNANA, iHAVECPU
 *  3. บันทึก LIVE data ลง price_compare_db
 *  4. แสดงตาราง Price Comparison + Match Report
 *
 * กฎ:
 *  - ห้าม mock / hard-code ราคา
 *  - ข้อมูลต้องมาจาก Playwright browser จริง
 *  - ถ้า scrape ไม่ได้ → NOT FOUND / FAILED (ห้ามสร้างข้อมูลแทน)
 *  - ข้อมูล LIVE เท่านั้น
 *
 * วิธีรัน: node src/scraper/testRun.js
 */

require('dotenv').config();

const { chromium } = require('playwright');
const { pool }     = require('../config/database');
const {
  extractGpuModel,
  extractBrand,
  extractVariant,
  extractVram,
  extractMemoryType,
  extractModelNumber,
  buildMatchKey,
  validatePrice,
} = require('../utils/productMatcher');

// ── Constants ────────────────────────────────────────────────
const TIMEOUT_MS  = 45_000;
const DELAY_MS    = 3_500;
const USER_AGENT  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SCRAPED_AT  = new Date();
const SOURCE_TYPE = 'LIVE';
const TARGET_COUNT = 4;

// ── Helpers ──────────────────────────────────────────────────
function ts()       { return new Date().toTimeString().slice(0,8); }
function log(msg)   { console.log(`[${ts()}] ${msg}`); }
function warn(msg)  { console.warn(`[${ts()}] ⚠️  ${msg}`); }
function ok(msg)    { console.log(`[${ts()}] ✅ ${msg}`); }
function fail(msg)  { console.error(`[${ts()}] ❌ ${msg}`); }
function delay(ms)  { return new Promise(r => setTimeout(r, ms)); }

function parsePrice(text = '') {
  if (!text) return null;
  // ลบ ฿ เครื่องหมาย Unicode ฿ (U+0E3F) และ comma
  const cleaned = text.replace(/[\u0E3F฿,\s]/g, '').replace(/[^\d.]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 || num > 9_999_999 ? null : num;
}

function buildRecord(item, store, storeId) {
  return {
    store,
    storeId,
    productName: item.name,
    brand:       extractBrand(item.name),
    gpuModel:    extractGpuModel(item.name),
    variant:     extractVariant(item.name),
    vram:        extractVram(item.name),
    memoryType:  extractMemoryType(item.name),
    modelNumber: extractModelNumber(item.name),
    matchKey:    buildMatchKey(item.name),
    price:       parsePrice(item.price),
    priceRaw:    item.price,
    availability: 'available',
    productUrl:  item.href,
    imageUrl:    item.img || null,
    scrapedAt:   SCRAPED_AT.toISOString(),
    sourceType:  SOURCE_TYPE,
  };
}

async function newBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  const ctx = await browser.newContext({
    userAgent:  USER_AGENT,
    locale:     'th-TH',
    timezoneId: 'Asia/Bangkok',
    viewport:   { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  return { browser, page };
}

async function safeGoto(page, url) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  const status = res?.status() || 0;
  log(`  HTTP ${status} → ${url}`);
  if (status === 403) throw new Error('HTTP 403 Forbidden — ถูกบล็อก');
  if (status === 429) throw new Error('HTTP 429 Too Many Requests — Rate limited');
  if (status >= 500) throw new Error(`HTTP ${status} Server Error`);
  return status;
}

async function checkCaptcha(page) {
  const body = await page.evaluate(() => document.body?.innerText || '');
  if (/captcha|robot|cf-browser-verification|access denied|กรุณายืนยัน/i.test(body)) {
    throw new Error('CAPTCHA/Block detected');
  }
  return body;
}

// ── ดึงสินค้าจาก page ด้วย selector หลายแบบ ──────────────────
async function extractProducts(page, storeName) {
  return page.evaluate((storeName) => {
    const results = [];
    const seen = new Set();

    // selector หลัก
    const cardSelectors = [
      '.product-item', '.product-card', '.product_item',
      '[class*="product-card"]', '[class*="product-item"]',
      '[class*="ProductCard"]', '[class*="ProductItem"]',
      '.card-product', '.item-card',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }

    if (cards.length > 0) {
      cards.forEach(card => {
        const nameEl  = card.querySelector(
          '[class*="name"], [class*="title"], [class*="Name"], h2, h3, h4'
        );
        const priceEl = card.querySelector(
          '[class*="price"], [class*="Price"], .selling-price, .final-price'
        );
        const linkEl  = card.querySelector('a[href]');
        const imgEl   = card.querySelector('img');

        const name  = nameEl?.innerText?.trim() || '';
        const price = priceEl?.innerText?.trim() || '';
        const href  = linkEl?.href || '';
        const img   = imgEl?.src || imgEl?.dataset?.src || '';

        if (name && href && !seen.has(href)) {
          seen.add(href);
          results.push({ name, price, href, img });
        }
      });
    }

    // fallback: ดึงจาก <a> ที่มี product ใน href
    if (results.length === 0) {
      const links = document.querySelectorAll('a[href*="product"], a[href*="/p/"]');
      links.forEach(a => {
        const href = a.href || '';
        if (!href || seen.has(href)) return;
        const name = a.innerText?.trim() || a.title || '';
        if (name.length < 10) return;
        const container = a.closest('li, [class*="col"], div');
        const priceEl = container?.querySelector('[class*="price"], [class*="Price"]');
        const price = priceEl?.innerText?.trim() || '';
        const imgEl = container?.querySelector('img');
        const img = imgEl?.src || imgEl?.dataset?.src || '';
        seen.add(href);
        results.push({ name, price, href, img });
      });
    }

    return results;
  }, storeName);
}

// ============================================================
// SCRAPE JIB — Category GPU
// ============================================================
async function scrapeJib() {
  log('[JIB] Starting scrape...');
  const { browser, page } = await newBrowser();

  try {
    const url = 'https://www.jib.co.th/web/product/product_list/2/51';
    await safeGoto(page, url);
    await delay(3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await delay(2000);
    await checkCaptcha(page);

    log(`[JIB] Title: ${await page.title()}`);

    const items = await extractProducts(page, 'JIB');
    log(`[JIB] Raw items found: ${items.length}`);

    const gpuItems = items.filter(item => {
      const n = item.name.toUpperCase();
      return (
        (n.includes('RTX') || n.includes(' RX ') || n.includes('ARC ') ||
         n.includes('RADEON') || n.includes('GEFORCE')) &&
        extractGpuModel(item.name) !== null
      );
    });

    ok(`[JIB] GPU items: ${gpuItems.length}`);
    return gpuItems.map(item => buildRecord(item, 'JIB', 1));

  } catch (err) {
    fail(`[JIB] ${err.message}`);
    return { error: err.message };
  } finally {
    await browser.close();
  }
}

// ============================================================
// SEARCH ADVICE — ค้นหา SKU เดียวกัน
// ============================================================
async function searchAdvice(targetSku) {
  log(`[Advice] Searching: ${targetSku.gpuModel} ${targetSku.variant || ''}`);
  const { browser, page } = await newBrowser();

  try {
    const q = encodeURIComponent(`${targetSku.gpuModel} ${targetSku.variant || ''}`.trim());
    const url = `https://www.advice.co.th/search?keyword=${q}`;
    await safeGoto(page, url);
    await delay(3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await delay(2000);
    await checkCaptcha(page);

    const items = await extractProducts(page, 'Advice');
    log(`[Advice] Found ${items.length} results`);

    for (const item of items) {
      if (!extractGpuModel(item.name)) continue;
      const mk = buildMatchKey(item.name);
      if (mk === targetSku.matchKey) {
        ok(`[Advice] MATCH: ${item.name}`);
        return { ...buildRecord(item, 'Advice', 2), matchStatus: 'MATCH' };
      }
    }

    log(`[Advice] NOT FOUND for ${targetSku.matchKey}`);
    return null;

  } catch (err) {
    fail(`[Advice] ${err.message}`);
    return { error: err.message, store: 'Advice' };
  } finally {
    await browser.close();
  }
}

// ============================================================
// SEARCH BaNANA
// ============================================================
async function searchBanana(targetSku) {
  log(`[BaNANA] Searching: ${targetSku.gpuModel} ${targetSku.variant || ''}`);
  const { browser, page } = await newBrowser();

  try {
    const q = encodeURIComponent(`${targetSku.gpuModel} ${targetSku.variant || ''}`.trim());
    const url = `https://www.banana.co.th/search?q=${q}`;
    await safeGoto(page, url);
    await delay(3000);
    await page.evaluate(async () => {
      await new Promise(r => {
        let h = 0;
        const t = setInterval(() => {
          window.scrollBy(0, 300);
          h += 300;
          if (h >= document.body.scrollHeight) { clearInterval(t); r(); }
        }, 150);
      });
    });
    await delay(2000);
    await checkCaptcha(page);

    const items = await extractProducts(page, 'BaNANA');
    log(`[BaNANA] Found ${items.length} results`);

    for (const item of items) {
      if (!extractGpuModel(item.name)) continue;
      const mk = buildMatchKey(item.name);
      if (mk === targetSku.matchKey) {
        ok(`[BaNANA] MATCH: ${item.name}`);
        return { ...buildRecord(item, 'BaNANA', 3), matchStatus: 'MATCH' };
      }
    }

    log(`[BaNANA] NOT FOUND for ${targetSku.matchKey}`);
    return null;

  } catch (err) {
    fail(`[BaNANA] ${err.message}`);
    return { error: err.message, store: 'BaNANA' };
  } finally {
    await browser.close();
  }
}

// ============================================================
// SEARCH iHAVECPU
// ============================================================
async function searchIhavecpu(targetSku) {
  log(`[iHAVECPU] Searching: ${targetSku.gpuModel} ${targetSku.variant || ''}`);
  const { browser, page } = await newBrowser();

  try {
    const q = encodeURIComponent(`${targetSku.gpuModel} ${targetSku.variant || ''}`.trim());
    const url = `https://www.ihavecpu.com/search?keyword=${q}`;
    await safeGoto(page, url);
    await delay(3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await delay(2000);
    await checkCaptcha(page);

    const items = await extractProducts(page, 'iHAVECPU');
    log(`[iHAVECPU] Found ${items.length} results`);

    for (const item of items) {
      if (!extractGpuModel(item.name)) continue;
      const mk = buildMatchKey(item.name);
      if (mk === targetSku.matchKey) {
        ok(`[iHAVECPU] MATCH: ${item.name}`);
        return { ...buildRecord(item, 'iHAVECPU', 4), matchStatus: 'MATCH' };
      }
    }

    log(`[iHAVECPU] NOT FOUND for ${targetSku.matchKey}`);
    return null;

  } catch (err) {
    fail(`[iHAVECPU] ${err.message}`);
    return { error: err.message, store: 'iHAVECPU' };
  } finally {
    await browser.close();
  }
}

// ============================================================
// SAVE TO DB
// ============================================================
async function saveToDb(record) {
  if (!record || record.error) return null;

  const conn = await pool.getConnection();
  try {
    let productId = null;

    // ลอง match ด้วย match_key
    const [existRows] = await conn.execute(
      'SELECT id FROM products WHERE match_key = ? LIMIT 1',
      [record.matchKey]
    );

    if (existRows.length > 0) {
      productId = existRows[0].id;
    } else {
      const [ins] = await conn.execute(
        `INSERT INTO products
           (name, brand, gpu_model, variant, vram, memory_type, image_url, model_number, match_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.productName,
          record.brand       || 'Unknown',
          record.gpuModel    || 'Unknown',
          record.variant     || null,
          record.vram        || null,
          record.memoryType  || null,
          record.imageUrl    || null,
          record.modelNumber || null,
          record.matchKey,
        ]
      );
      productId = ins.insertId;
    }

    const validPrice = validatePrice(record.price);
    if (validPrice !== null) {
      await conn.execute(
        `INSERT INTO prices
           (product_id, store_id, price, product_url, availability, scraped_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           price        = VALUES(price),
           product_url  = VALUES(product_url),
           availability = VALUES(availability),
           scraped_at   = VALUES(scraped_at),
           updated_at   = CURRENT_TIMESTAMP`,
        [
          productId,
          record.storeId,
          validPrice,
          record.productUrl,
          record.availability || 'available',
          new Date(record.scrapedAt),
        ]
      );
    }

    return productId;
  } catch (err) {
    fail(`[DB] ${err.message}`);
    return null;
  } finally {
    conn.release();
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const LINE = '='.repeat(65);
  const line = '-'.repeat(65);

  console.log('\n' + LINE);
  console.log('  🎮 GPU Price Scraper — ONE-SHOT TEST RUN');
  console.log(`  Started : ${SCRAPED_AT.toLocaleString('th-TH')}`);
  console.log(`  Source  : ${SOURCE_TYPE} (ข้อมูลจากเว็บไซต์จริง)`);
  console.log(LINE + '\n');

  // ── TEST DB ──────────────────────────────────────────────
  log('Testing DB connection...');
  try {
    await pool.execute('SELECT 1');
    ok('Database connected (price_compare_db)');
  } catch (err) {
    fail(`DB FAILED: ${err.message}`);
    process.exit(1);
  }

  // ── PHASE 1: JIB ─────────────────────────────────────────
  console.log('\n' + line);
  console.log('  PHASE 1: Scraping JIB GPU Category');
  console.log(line);

  const jibResult = await scrapeJib();

  if (!Array.isArray(jibResult) || jibResult.length === 0) {
    const errMsg = jibResult?.error || 'No GPU products found';
    fail(`[JIB] FAILED — ${errMsg}`);
    fail('Cannot continue without JIB data (JIB = reference store)');
    await pool.end();
    return;
  }

  ok(`[JIB] Total GPU products found: ${jibResult.length}`);

  // เลือก 4 SKU ที่มีข้อมูลชัดเจนและไม่ซ้ำ matchKey
  const seenKeys = new Set();
  const selectedSkus = [];
  for (const p of jibResult) {
    if (!p.gpuModel || !p.matchKey || !p.productUrl) continue;
    if (seenKeys.has(p.matchKey)) continue;
    seenKeys.add(p.matchKey);
    selectedSkus.push(p);
    if (selectedSkus.length >= TARGET_COUNT) break;
  }

  if (selectedSkus.length === 0) {
    fail('No valid SKUs selected from JIB');
    await pool.end();
    return;
  }

  console.log(`\n✅ Selected ${selectedSkus.length} SKU(s) from JIB:\n`);
  selectedSkus.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.productName}`);
    console.log(`     Brand   : ${s.brand}`);
    console.log(`     GPU     : ${s.gpuModel}`);
    console.log(`     Variant : ${s.variant || 'N/A'}`);
    console.log(`     VRAM    : ${s.vram || 'N/A'}`);
    console.log(`     MemType : ${s.memoryType || 'N/A'}`);
    console.log(`     ModelNo : ${s.modelNumber || 'N/A'}`);
    console.log(`     Price   : ${s.price ? '฿' + s.price.toLocaleString('th-TH') : 'NOT FOUND (raw: "' + s.priceRaw + '")'  }`);
    console.log(`     MatchKey: ${s.matchKey}`);
    console.log(`     URL     : ${s.productUrl}`);
    console.log();
  });

  // ── PHASE 2: CROSS-STORE MATCHING ────────────────────────
  console.log(line);
  console.log('  PHASE 2: Cross-Store SKU Matching');
  console.log(line);

  const compTable = {};       // matchKey → { JIB, Advice, BaNANA, iHAVECPU }
  const allToSave = [];

  for (const jibSku of selectedSkus) {
    compTable[jibSku.matchKey] = {
      sku: jibSku,
      JIB:      jibSku,
      Advice:   null,
      BaNANA:   null,
      iHAVECPU: null,
    };
    allToSave.push(jibSku);

    log(`\n[CROSS] Processing: ${jibSku.productName}`);

    await delay(DELAY_MS);
    const adv = await searchAdvice(jibSku);
    compTable[jibSku.matchKey].Advice = adv;
    if (adv && !adv.error) allToSave.push(adv);

    await delay(DELAY_MS);
    const ban = await searchBanana(jibSku);
    compTable[jibSku.matchKey].BaNANA = ban;
    if (ban && !ban.error) allToSave.push(ban);

    await delay(DELAY_MS);
    const iha = await searchIhavecpu(jibSku);
    compTable[jibSku.matchKey].iHAVECPU = iha;
    if (iha && !iha.error) allToSave.push(iha);
  }

  // ── PHASE 3: SAVE TO DB ───────────────────────────────────
  console.log('\n' + line);
  console.log('  PHASE 3: Saving LIVE data to price_compare_db');
  console.log(line);

  let savedCount = 0;
  for (const rec of allToSave) {
    if (rec && !rec.error) {
      const id = await saveToDb(rec);
      if (id !== null) {
        savedCount++;
        log(`[DB] Saved: ${rec.store} | ${rec.productName} | ฿${rec.price?.toLocaleString() || 'N/A'}`);
      }
    }
  }
  ok(`[DB] Total saved: ${savedCount} LIVE records`);

  // ── PHASE 4: DISPLAY RESULTS ──────────────────────────────
  console.log('\n' + LINE);
  console.log('  📊 PRICE COMPARISON TABLE');
  console.log(LINE);

  const STORES = ['JIB', 'Advice', 'BaNANA', 'iHAVECPU'];
  let totalMatch = 0, totalNotFound = 0, totalFailed = 0;

  for (const [matchKey, data] of Object.entries(compTable)) {
    const jibSku = data.sku;
    console.log(`\n▶ ${jibSku.productName}`);
    console.log(`  Match Key: ${matchKey}`);
    console.log(`  ${'Store'.padEnd(12)} ${'Product Name'.padEnd(45)} ${'Price'.padStart(12)}  Status`);
    console.log('  ' + '-'.repeat(85));

    for (const sName of STORES) {
      const r = data[sName];
      let productDisplay, priceDisplay, status;

      if (sName === 'JIB') {
        productDisplay = r.productName.slice(0, 44).padEnd(45);
        priceDisplay   = r.price ? `฿${r.price.toLocaleString('th-TH')}`.padStart(12) : '   PRICE N/A';
        status         = `[${SOURCE_TYPE}] [REF]`;
      } else if (!r) {
        productDisplay = 'NOT FOUND'.padEnd(45);
        priceDisplay   = '         -'.padStart(12);
        status         = `[${SOURCE_TYPE}] [NOT FOUND]`;
        totalNotFound++;
      } else if (r.error) {
        productDisplay = `FAILED: ${r.error.slice(0, 37)}`.padEnd(45);
        priceDisplay   = '         -'.padStart(12);
        status         = '[FAILED]';
        totalFailed++;
      } else {
        productDisplay = r.productName.slice(0, 44).padEnd(45);
        priceDisplay   = r.price ? `฿${r.price.toLocaleString('th-TH')}`.padStart(12) : '   PRICE N/A';
        status         = `[${SOURCE_TYPE}] [MATCH]`;
        totalMatch++;
      }

      console.log(`  ${sName.padEnd(12)} ${productDisplay} ${priceDisplay}  ${status}`);
    }

    // URLs
    console.log(`\n  🔗 URLs:`);
    for (const sName of STORES) {
      const r = data[sName];
      if (r && !r.error) {
        console.log(`    ${sName}: ${r.productUrl}`);
      }
    }
  }

  // ── FINAL SUMMARY ─────────────────────────────────────────
  console.log('\n' + LINE);
  console.log('  📋 FINAL SUMMARY');
  console.log(LINE);
  console.log(`\n  SKUs Tested   : ${selectedSkus.length} / ${TARGET_COUNT}`);
  console.log(`  ✅ MATCH       : ${totalMatch}  (เจอ SKU เดียวกัน)`);
  console.log(`  🔍 NOT FOUND   : ${totalNotFound}  (ไม่มี SKU นี้ในร้าน)`);
  console.log(`  ❌ FAILED      : ${totalFailed}  (Scrape ไม่สำเร็จ)`);
  console.log(`  💾 Saved to DB : ${savedCount} records (${SOURCE_TYPE} data only)`);
  console.log(`  🕐 Scraped At  : ${SCRAPED_AT.toISOString()}`);

  console.log('\n  Per-SKU Result:');
  for (const [, data] of Object.entries(compTable)) {
    const s = data.sku;
    const storeLines = STORES.map(sName => {
      const r = data[sName];
      if (sName === 'JIB') return `JIB:฿${s.price?.toLocaleString() || 'N/A'}`;
      if (!r)        return `${sName}:NOT_FOUND`;
      if (r.error)   return `${sName}:FAILED`;
      return `${sName}:฿${r.price?.toLocaleString() || 'N/A'}`;
    });
    console.log(`\n  • ${s.productName}`);
    console.log(`    ${storeLines.join(' | ')}`);
    console.log(`    MatchKey: ${s.matchKey}`);
    console.log(`    ScrapedAt: ${SCRAPED_AT.toISOString()}`);
  }

  console.log('\n' + LINE);
  console.log('  ✅ TEST RUN COMPLETE');
  console.log(LINE + '\n');

  await pool.end();
}

main().catch(err => {
  fail(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
