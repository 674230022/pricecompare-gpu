/**
 * runScraper.js - Manual Scraper Runner
 * ใช้รัน scraper ด้วยมือสำหรับทดสอบ
 *
 * การใช้งาน:
 *   node src/scraper/runScraper.js          → รันทุกร้าน
 *   node src/scraper/runScraper.js jib      → รันแค่ JIB
 *   node src/scraper/runScraper.js advice   → รันแค่ Advice
 *   node src/scraper/runScraper.js banana   → รันแค่ BaNANA
 *   node src/scraper/runScraper.js ihavecpu → รันแค่ iHAVECPU
 */

require('dotenv').config();

const logger        = require('../utils/logger');
const JibScraper    = require('./jib');
const BananaScraper = require('./banana');
const IhavecpuScraper = require('./ihavecpu');

// Map ชื่อ → class
const SCRAPERS = {
  jib:      JibScraper,
  banana:   BananaScraper,
  ihavecpu: IhavecpuScraper,
};

async function runAll() {
  const target = process.argv[2]?.toLowerCase();
  const toRun  = target ? [target] : Object.keys(SCRAPERS);

  logger.info(`=== Manual Scraper Run ===`);
  logger.info(`Targets: ${toRun.join(', ')}`);

  const results = [];

  for (const name of toRun) {
    const ScraperClass = SCRAPERS[name];
    if (!ScraperClass) {
      logger.warn(`Unknown scraper: "${name}". Available: ${Object.keys(SCRAPERS).join(', ')}`);
      continue;
    }

    logger.info(`\n--- Running ${name.toUpperCase()} ---`);
    const scraper = new ScraperClass();

    const startTime = Date.now();
    const result    = await scraper.run();
    const elapsed   = ((Date.now() - startTime) / 1000).toFixed(1);

    results.push({ name, ...result, elapsed });

    if (result?.success) {
      logger.success(`${name}: ✅ ${result.count} products (${elapsed}s)`);
    } else {
      logger.error(`${name}: ❌ ${result?.error || 'Unknown error'} (${elapsed}s)`);
    }

    // หน่วงเวลาระหว่างร้าน (5 วินาที)
    if (toRun.indexOf(name) < toRun.length - 1) {
      logger.scraper('Waiting 5s before next store...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const detail = r.success ? `${r.count} products` : r.error;
    console.log(`${status} ${r.name}: ${detail} (${r.elapsed}s)`);
  });

  process.exit(0);
}

runAll().catch(err => {
  logger.error(`runScraper failed: ${err.message}`);
  process.exit(1);
});
