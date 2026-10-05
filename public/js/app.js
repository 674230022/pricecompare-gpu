/**
 * app.js
 * PriceCompare GPU - Homepage
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initHeroSearch();
  loadSystemStatus();
  loadFeaturedGpu();
});


/* ============================================================
   Navigation
   ============================================================ */

function initNavigation() {

  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (!navToggle || !navLinks) return;

  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach(link => {

    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
    });

  });
}


/* ============================================================
   Hero Search
   ============================================================ */

function initHeroSearch() {

  const form = document.getElementById('heroSearchForm');
  const input = document.getElementById('heroSearchInput');

  if (!form || !input) return;

  form.addEventListener('submit', event => {

    event.preventDefault();

    const query = input.value.trim();

    if (!query) {
      window.location.href = 'gpu.html';
      return;
    }

    window.location.href =
      `gpu.html?q=${encodeURIComponent(query)}`;

  });
}


/* ============================================================
   System Status
   ============================================================ */

async function loadSystemStatus() {

  try {

    const response = await fetch('/api/status');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error('API status is not ok');
    }

    const stats = data.stats || {};

    setText(
      'statGpuCount',
      formatNumber(stats.products)
    );

    setText(
      'statPriceCount',
      formatNumber(stats.prices)
    );

    setText(
      'statStoreCount',
      formatNumber(stats.stores)
    );

    setText(
      'statLastUpdate',
      formatLastUpdate(stats.lastUpdate)
    );

  } catch (error) {

    console.error(
      '[Homepage] Failed to load system status:',
      error
    );

    setText('statGpuCount', '—');
    setText('statPriceCount', '—');
    setText('statStoreCount', '3');
    setText('statLastUpdate', 'ไม่พร้อมใช้งาน');

  }
}


/* ============================================================
   Featured GPU
   ============================================================ */

async function loadFeaturedGpu() {

  const grid = document.getElementById('featuredGrid');

  if (!grid) return;

  try {

    const response = await fetch(
      '/api/gpus?limit=4&sort=lowest_price'
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const products = normalizeGpuData(data);

    if (!products.length) {

      grid.innerHTML = `
        <div class="featured-loading">
          ยังไม่มีข้อมูล GPU
        </div>
      `;

      return;
    }

    const featured = products
      .sort((a, b) => {

        const priceA =
          Number(a.lowest_price ?? a.min_price ?? Infinity);

        const priceB =
          Number(b.lowest_price ?? b.min_price ?? Infinity);

        return priceA - priceB;

      })
      .slice(0, 4);

    grid.innerHTML = featured
      .map(createFeaturedCard)
      .join('');

  } catch (error) {

    console.error(
      '[Homepage] Failed to load featured GPU:',
      error
    );

    grid.innerHTML = `
      <div class="featured-loading">
        ไม่สามารถโหลดข้อมูล GPU ได้
      </div>
    `;

  }
}


/* ============================================================
   Normalize API Response
   ============================================================ */

function normalizeGpuData(data) {

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  if (Array.isArray(data.products)) {
    return data.products;
  }

  if (Array.isArray(data.gpus)) {
    return data.gpus;
  }

  return [];
}


/* ============================================================
   Featured Card
   ============================================================ */

function createFeaturedCard(gpu) {

  const id =
    gpu.id ??
    gpu.product_id ??
    '';

  const name =
    gpu.product_name ??
    gpu.name ??
    gpu.gpu_model ??
    'GPU ไม่ระบุชื่อ';

  const brand =
    gpu.brand ??
    extractBrand(name) ??
    'GPU';

  const image =
    gpu.image_url ??
    gpu.imageUrl ??
    gpu.image ??
    '';

  const price =
    gpu.lowest_price ??
    gpu.min_price ??
    gpu.price ??
    null;

  const storeCount =
    gpu.store_count ??
    gpu.storeCount ??
    gpu.price_count ??
    0;

  const safeName = escapeHtml(name);
  const safeBrand = escapeHtml(brand);

  const priceText =
    price !== null && price !== undefined
      ? formatPrice(price)
      : 'ไม่มีราคา';

  const imageHtml = image
    ? `
      <img
        src="${escapeAttribute(image)}"
        alt="${safeName}"
        loading="lazy"
        onerror="this.style.display='none'"
      >
    `
    : `
      <span style="
        color:#9aa8b8;
        font-size:12px;
      ">
        ไม่มีรูปภาพ
      </span>
    `;

  return `
    <article class="featured-card">

      <a
        href="gpu.html?id=${encodeURIComponent(id)}"
        style="display:block;"
      >

        <div class="featured-image">
          ${imageHtml}
        </div>

      </a>

      <div class="featured-body">

        <div class="featured-brand">
          ${safeBrand}
        </div>

        <div class="featured-name">
          ${safeName}
        </div>

        <div class="featured-price-label">
          ราคาต่ำสุด
        </div>

        <div class="featured-price">
          ${priceText}
        </div>

        <div class="featured-meta">

          <span>
            ${storeCount} ร้าน
          </span>

          <a
            href="gpu.html?id=${encodeURIComponent(id)}"
            style="
              color:var(--primary-light);
              font-weight:600;
            "
          >
            ดูรายละเอียด →
          </a>

        </div>

      </div>

    </article>
  `;
}


/* ============================================================
   Helpers
   ============================================================ */

function setText(id, value) {

  const element = document.getElementById(id);

  if (!element) return;

  element.textContent = value;
}


function formatNumber(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return number.toLocaleString('th-TH');
}


function formatPrice(value) {

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 'ไม่มีราคา';
  }

  return `฿${number.toLocaleString('th-TH')}`;
}


function formatLastUpdate(dateString) {

  if (!dateString) {
    return 'ยังไม่มีข้อมูล';
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return 'ไม่ทราบเวลา';
  }

  const diffSeconds =
    Math.max(
      0,
      Math.floor(
        (Date.now() - date.getTime()) / 1000
      )
    );

  if (diffSeconds < 60) {
    return `${diffSeconds} วินาที`;
  }

  const minutes =
    Math.floor(diffSeconds / 60);

  if (minutes < 60) {
    return `${minutes} นาที`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} ชั่วโมง`;
  }

  const days =
    Math.floor(hours / 24);

  return `${days} วัน`;
}


function extractBrand(name) {

  if (!name) return '';

  const brands = [
    'ASUS',
    'MSI',
    'GIGABYTE',
    'SAPPHIRE',
    'POWERCOLOR',
    'ZOTAC',
    'GALAX',
    'INNO3D',
    'PALIT',
    'ASROCK',
    'XFX'
  ];

  const upperName = name.toUpperCase();

  return brands.find(
    brand => upperName.includes(brand)
  ) || '';
}


function escapeHtml(value) {

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function escapeAttribute(value) {

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}