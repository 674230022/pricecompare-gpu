/**
 * jib.js - JIB Computer Group Scraper
 * Scrape GPU products from JIB
 */

const { BaseScraper } = require('./baseScraper');
const { extractGpuModel } = require('../utils/productMatcher');
const logger = require('../utils/logger');

// GPU keywords
const GPU_KEYWORDS = ['RTX', 'RX ', 'ARC '];

class JibScraper extends BaseScraper {
  constructor() {
    super('JIB', 1);
  }

  async scrape() {
    const products = [];

    // JIB GPU category
    const baseUrl =
      'https://www.jib.co.th/web/product/product_list/2/51';

    logger.scraper(`[JIB] Navigating to: ${baseUrl}`);

    // JIB uses offset pagination
    // Page 1 = no offset
    // Page 2 = offset 100
    const pageUrls = [
      baseUrl,
      `${baseUrl}/100`
    ];

    for (let pageNumber = 0; pageNumber < pageUrls.length; pageNumber++) {

      const url = pageUrls[pageNumber];

      logger.scraper(
        `[JIB] Scraping page ${pageNumber + 1}: ${url}`
      );

      try {
        await this._goto(url);

        await this.page.waitForLoadState('networkidle', {
          timeout: 15000
        }).catch(() => {});

        const items = await this.page
          .locator('.promo_name')
          .evaluateAll((els) => {

            return els.map((el) => {

              // Product URL
              const productLink = el.closest('a');

              // Product container
              const container =
                productLink?.parentElement
                  ?.parentElement
                  ?.parentElement;

              // Product image
              const image = container?.querySelector(
                'img.imgpspecial'
              );

              // Product price
              const priceElement = container?.querySelector(
                '.price_total'
              );

              return {
                name: el.innerText.trim(),

                price:
                  priceElement?.innerText?.trim() || null,

                href:
                  productLink?.href || null,

                img:
                  image?.src || null
              };
            });
          });

        logger.scraper(
          `[JIB] Found ${items.length} items on page ${pageNumber + 1}`
        );

        for (const item of items) {

          if (!item.name) {
            continue;
          }

          // Check GPU
          const isGpu = GPU_KEYWORDS.some((keyword) =>
            item.name
              .toUpperCase()
              .includes(keyword.toUpperCase())
          );

          if (!isGpu) {
            continue;
          }

          // Make sure product matcher can identify GPU model
          if (!extractGpuModel(item.name)) {

            logger.warn(
              `[JIB] Could not extract GPU model: ${item.name}`
            );

            continue;
          }

          // Parse price
          const price = this._parsePrice(item.price);

          if (!price || price <= 0) {

            logger.warn(
              `[JIB] Invalid price: ${item.name} -> ${item.price}`
            );

            continue;
          }

          products.push({
            name: item.name,
            price: price,
            productUrl: item.href,
            imageUrl: item.img,
            availability: 'available'
          });
        }

      } catch (error) {

        logger.warn(
          `[JIB] Page ${pageNumber + 1} failed: ${error.message}`
        );
      }
    }

    // Remove duplicate products
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
      `[JIB] Total GPU products: ${uniqueProducts.length}`
    );

    return uniqueProducts;
  }
}

module.exports = JibScraper;