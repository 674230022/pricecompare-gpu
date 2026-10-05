/**
 * ihavecpu.js - iHAVECPU Scraper
 * URL: https://ihavecpu.com/category/graphic-card
 */

const { BaseScraper } = require('./baseScraper');
const { extractGpuModel } = require('../utils/productMatcher');
const logger = require('../utils/logger');

const GPU_KEYWORDS = [
  'RTX',
  'RX ',
  'Radeon',
  'GeForce',
  'Arc '
];

class IhavecpuScraper extends BaseScraper {
  constructor() {
    super('iHAVECPU', 4);
  }

  async scrape() {
    const products = [];

    const url = 'https://ihavecpu.com/category/graphic-card';

    logger.scraper(`[iHAVECPU] Navigating to: ${url}`);

    await this._goto(url);

    await this._delay(4000);

    const items = await this.page.evaluate(() => {
      const results = [];

      const links = [...document.querySelectorAll('a[href*="/product/"]')];

      for (const link of links) {
        const text = link.innerText
          ?.trim()
          .replace(/\s+/g, ' ');

        if (!text) continue;

        const priceMatch = text.match(/฿\s*[\d,]+(?:\.\d{2})?/);
        if (!priceMatch) continue;

        const name = text
          .split('฿')[0]
          .trim();

        const img = link.querySelector('img');

        results.push({
          name,
          price: priceMatch[0],
          href: link.href,
          img: img?.src || img?.dataset?.src || null
        });
      }

      return results;
    });

    logger.scraper(
      `[iHAVECPU] Found ${items.length} products`
    );

    const seen = new Set();

    for (const item of items) {
      const isGpu = GPU_KEYWORDS.some(keyword =>
        item.name.toUpperCase().includes(keyword.toUpperCase())
      );

      if (!isGpu) continue;

      const gpuModel = extractGpuModel(item.name);

      if (!gpuModel) {
        logger.warn(
          `[iHAVECPU] Could not extract GPU model: ${item.name}`
        );
        continue;
      }

      const price = this._parsePrice(item.price);

      if (!price || price <= 0) {
        logger.warn(
          `[iHAVECPU] Invalid price: ${item.name}`
        );
        continue;
      }

      if (seen.has(item.href)) continue;

      seen.add(item.href);

      products.push({
        name: item.name,
        price,
        productUrl: item.href,
        imageUrl: item.img,
        availability: 'available'
      });
    }

    logger.scraper(
      `[iHAVECPU] Filtered to ${products.length} GPU products`
    );

    return products;
  }
}

module.exports = IhavecpuScraper;