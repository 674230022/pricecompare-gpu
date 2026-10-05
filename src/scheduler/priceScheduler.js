/**
 * priceScheduler.js - Price Update Scheduler
 *
 * ตารางเวลา:
 *   ทุก 60 นาที → JIB + BaNANA + iHAVECPU
 *                  รันพร้อมกัน
 *
 * กฎ:
 * - ไม่ Scrape ทุกครั้งที่ User เปิดเว็บ
 * - ถ้า Scraper พบ 403/429/CAPTCHA ให้หยุดร้านนั้นในรอบนั้น
 * - บันทึก Log ทุกครั้ง
 * - ป้องกันไม่ให้ Scheduler รันซ้อนกัน
 */

const cron = require('node-cron');
const logger = require('../utils/logger');

// ============================================================
// Import Scrapers
// ============================================================

const JibScraper      = require('../scraper/jib');
const BananaScraper   = require('../scraper/banana');
const IhavecpuScraper = require('../scraper/ihavecpu');


// ============================================================
// State: ป้องกัน scraper รันซ้อนกัน
// ============================================================

let isRunning = false;


// ============================================================
// สถิติ Scheduler
// ============================================================

const stats = {
  totalRuns: 0,
  lastRun: null,
  lastSuccess: null,
  lastError: null,
};


// ============================================================
// รัน Scraper ของร้านเดียว
// ============================================================

/**
 * รัน Scraper ของร้านเดียว พร้อม error handling
 *
 * @param {Function} ScraperClass - class ของ scraper
 */
async function runStore(ScraperClass) {

  const scraper = new ScraperClass();
  const name = scraper.storeName;

  try {

    logger.scraper(
      `[Scheduler] Starting ${name}...`
    );

    const result = await scraper.run();


    // --------------------------------------------------------
    // Fatal เช่น CAPTCHA / 403 / 429
    // --------------------------------------------------------

    if (result?.fatal) {

      logger.warn(
        `[Scheduler] ${name} stopped (fatal): ${result.error}`
      );

      return {
        store: name,
        success: false,
        fatal: true,
        error: result.error,
      };
    }


    // --------------------------------------------------------
    // สำเร็จ
    // --------------------------------------------------------

    if (result?.success) {

      logger.success(
        `[Scheduler] ${name} done: ${result.count} products`
      );

      return {
        store: name,
        success: true,
        count: result.count,
      };
    }


    // --------------------------------------------------------
    // Scraper ทำงานแต่ไม่สำเร็จ
    // --------------------------------------------------------

    logger.error(
      `[Scheduler] ${name} failed: ${result?.error || 'Unknown error'}`
    );

    return {
      store: name,
      success: false,
      fatal: false,
      error: result?.error || 'Unknown error',
    };


  } catch (err) {

    logger.error(
      `[Scheduler] ${name} unexpected error: ${err.message}`
    );

    return {
      store: name,
      success: false,
      fatal: false,
      error: err.message,
    };
  }
}


// ============================================================
// รัน Scraper ทั้ง 3 ร้านพร้อมกัน
// ============================================================

/**
 * JIB + BaNANA + iHAVECPU
 * จะเริ่มทำงานพร้อมกันในรอบเดียว
 */
async function runAllStores() {

  // ----------------------------------------------------------
  // ป้องกันการรันซ้อน
  // ----------------------------------------------------------

  if (isRunning) {

    logger.warn(
      '[Scheduler] Previous run still in progress — skipping'
    );

    return;
  }


  isRunning = true;

  stats.totalRuns++;
  stats.lastRun = new Date().toISOString();


  // ----------------------------------------------------------
  // Log เริ่มรอบ
  // ----------------------------------------------------------

  logger.info(`\n${'═'.repeat(60)}`);

  logger.info(
    `[Scheduler] Cycle #${stats.totalRuns} started at ` +
    `${new Date().toLocaleTimeString('th-TH')}`
  );

  logger.info(
    '[Scheduler] Running all 3 stores simultaneously...'
  );

  logger.info(`${'═'.repeat(60)}`);


  try {

    // ========================================================
    // รันทั้ง 3 ร้านพร้อมกัน
    // ========================================================

    const results = await Promise.all([
      runStore(JibScraper),
      runStore(BananaScraper),
      runStore(IhavecpuScraper),
    ]);


    // ========================================================
    // สรุปผล
    // ========================================================

    const successCount = results.filter(
      result => result.success
    ).length;

    const failedCount = results.filter(
      result => !result.success
    ).length;


    logger.info(
      `[Scheduler] Cycle #${stats.totalRuns} result: ` +
      `${successCount}/3 stores succeeded, ` +
      `${failedCount}/3 failed`
    );


    // --------------------------------------------------------
    // แสดงผลแต่ละร้าน
    // --------------------------------------------------------

    for (const result of results) {

      if (result.success) {

        logger.success(
          `[Scheduler] ${result.store}: ` +
          `${result.count} products`
        );

      } else if (result.fatal) {

        logger.warn(
          `[Scheduler] ${result.store}: ` +
          `STOPPED (fatal)`
        );

      } else {

        logger.error(
          `[Scheduler] ${result.store}: ` +
          `FAILED`
        );
      }
    }


    // ========================================================
    // บันทึกสถานะ
    // ========================================================

    if (successCount > 0) {

      stats.lastSuccess =
        new Date().toISOString();

    }

    if (failedCount > 0) {

      stats.lastError =
        new Date().toISOString();

    }


    logger.success(
      `[Scheduler] Cycle #${stats.totalRuns} completed ✅`
    );


  } catch (err) {

    logger.error(
      `[Scheduler] Cycle error: ${err.message}`
    );

    stats.lastError =
      new Date().toISOString();


  } finally {

    // --------------------------------------------------------
    // ปลด Lock
    // --------------------------------------------------------

    isRunning = false;
  }
}


// ============================================================
// สร้าง Cron Expression
// ============================================================

/**
 * สร้าง cron expression จาก interval (นาที)
 *
 * ตัวอย่าง:
 *
 * 30 → ทุก 30 นาที
 * 60 → ทุก 1 ชั่วโมง
 * 120 → ทุก 2 ชั่วโมง
 */
function buildCronExpression(intervalMinutes) {

  // ----------------------------------------------------------
  // ทุก 60 นาทีขึ้นไป
  // ----------------------------------------------------------

  if (
    intervalMinutes >= 60 &&
    intervalMinutes % 60 === 0
  ) {

    const hours =
      intervalMinutes / 60;

    return hours === 1
      ? '0 * * * *'
      : `0 */${hours} * * *`;
  }


  // ----------------------------------------------------------
  // ต่ำกว่า 60 นาที
  // ----------------------------------------------------------

  return `*/${intervalMinutes} * * * *`;
}


// ============================================================
// เริ่มต้น Scheduler
// ============================================================

/**
 * อ่าน SCRAPE_INTERVAL_MINUTES จาก .env
 *
 * ตัวอย่าง:
 *
 * SCRAPE_INTERVAL_MINUTES=60
 *
 * → ทุกต้นชั่วโมง
 */
function startScheduler() {

  const interval = Math.max(
    parseInt(
      process.env.SCRAPE_INTERVAL_MINUTES
    ) || 60,
    5
  );


  const cronExpr =
    buildCronExpression(interval);


  // ----------------------------------------------------------
  // Log Configuration
  // ----------------------------------------------------------

  logger.info(
    `[Scheduler] interval=${interval}min, ` +
    `cron="${cronExpr}"`
  );


  // ----------------------------------------------------------
  // Register Cron
  // ----------------------------------------------------------

  const job = cron.schedule(
    cronExpr,

    () => {

      logger.info(
        '[Scheduler] ⏰ Cron triggered'
      );

      runAllStores();

    },

    {
      timezone: 'Asia/Bangkok',
    }
  );


  logger.success(
    `[Scheduler] Registered: "${cronExpr}" ` +
    `(every ${interval} min)`
  );


  // ----------------------------------------------------------
  // Scrape ตอนเปิด Server
  // ----------------------------------------------------------

  if (
    process.env.SCRAPE_ON_START === 'true'
  ) {

    logger.info(
      '[Scheduler] SCRAPE_ON_START=true ' +
      '→ running in 3s...'
    );


    setTimeout(() => {

      runAllStores();

    }, 3000);
  }


  return job;
}


// ============================================================
// ดูสถิติ Scheduler
// ============================================================

function getSchedulerStats() {

  return {
    ...stats,
    isRunning,
  };
}


// ============================================================
// Export
// ============================================================

module.exports = {
  startScheduler,
  getSchedulerStats,
};