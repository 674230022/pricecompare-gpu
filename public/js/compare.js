/**
 * compare.js
 * PriceCompare GPU - Compare Page
 */

document.addEventListener('DOMContentLoaded', () => {

  initNavigation();
  initCompareSearch();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (id) {
    loadComparison(id);
  }

});


/* ============================================================
   Navigation
   ============================================================ */

function initNavigation() {

  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');

  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
  });

  links.querySelectorAll('a').forEach(link => {

    link.addEventListener('click', () => {
      links.classList.remove('open');
    });

  });

}


/* ============================================================
   Search
   ============================================================ */

function initCompareSearch() {

  const form = document.getElementById('compareSearchForm');
  const input = document.getElementById('compareSearchInput');

  if (!form || !input) return;

  form.addEventListener('submit', async event => {

    event.preventDefault();

    const query = input.value.trim();

    if (query.length < 2) {
      showMessage(
        'กรุณาระบุชื่อ GPU อย่างน้อย 2 ตัวอักษร'
      );

      return;
    }

    await searchGpu(query);

  });

}


/* ============================================================
   Search GPU
   ============================================================ */

async function searchGpu(query) {

  const container =
    document.getElementById('compareContent');

  container.innerHTML = `
    <div class="compare-loading">
      กำลังค้นหา GPU...
    </div>
  `;

  try {

    const response = await fetch(
      `/api/gpus/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    const products =
      Array.isArray(result)
        ? result
        : result.data || result.products || [];

    if (!products.length) {

      container.innerHTML = `
        <div class="compare-empty">

          <strong>
            ไม่พบ GPU
          </strong>

          ไม่พบสินค้าที่ตรงกับ
          "${escapeHtml(query)}"

        </div>
      `;

      return;
    }

    /*
     * ใช้สินค้าตัวแรกที่ค้นพบ
     * เพื่อเข้าสู่หน้าเปรียบเทียบ
     */
    const product = products[0];

    const id =
      product.id ??
      product.product_id;

    if (!id) {
      throw new Error('GPU ID not found');
    }

    await loadComparison(id);

  } catch (error) {

    console.error(
      '[Compare] Search error:',
      error
    );

    container.innerHTML = `
      <div class="compare-empty">

        <strong>
          ไม่สามารถค้นหาข้อมูลได้
        </strong>

        กรุณาลองใหม่อีกครั้ง

      </div>
    `;

  }

}


/* ============================================================
   Load GPU + Prices
   ============================================================ */

async function loadComparison(id) {

  const container =
    document.getElementById('compareContent');

  container.innerHTML = `
    <div class="compare-loading">
      กำลังโหลดข้อมูลราคา...
    </div>
  `;

  try {

    const [productResponse, pricesResponse] =
      await Promise.all([

        fetch(`/api/gpus/${encodeURIComponent(id)}`),

        fetch(`/api/gpus/${encodeURIComponent(id)}/prices`)

      ]);

    if (!productResponse.ok) {
      throw new Error(
        `Product API HTTP ${productResponse.status}`
      );
    }

    if (!pricesResponse.ok) {
      throw new Error(
        `Price API HTTP ${pricesResponse.status}`
      );
    }

    const productResult =
      await productResponse.json();

    const pricesResult =
      await pricesResponse.json();

    const product =
      productResult.data ||
      productResult.product ||
      productResult;

    const prices =
      Array.isArray(pricesResult)
        ? pricesResult
        : pricesResult.data ||
          pricesResult.prices ||
          [];

    renderComparison(product, prices);

  } catch (error) {

    console.error(
      '[Compare] Load error:',
      error
    );

    container.innerHTML = `
      <div class="compare-empty">

        <strong>
          ไม่สามารถโหลดข้อมูลราคาได้
        </strong>

        ตรวจสอบ API หรือข้อมูล GPU แล้วลองอีกครั้ง

      </div>
    `;

  }

}


/* ============================================================
   Render
   ============================================================ */

function renderComparison(product, prices) {

  const container =
    document.getElementById('compareContent');

  if (!product) {

    container.innerHTML = `
      <div class="compare-empty">
        ไม่พบข้อมูล GPU
      </div>
    `;

    return;
  }

  const sortedPrices = [...prices]
    .filter(item => Number(item.price) > 0)
    .sort(
      (a, b) =>
        Number(a.price) - Number(b.price)
    );

  const lowest =
    sortedPrices.length
      ? Number(sortedPrices[0].price)
      : null;

  const highest =
    sortedPrices.length
      ? Number(
          sortedPrices[sortedPrices.length - 1].price
        )
      : null;

  const difference =
    lowest !== null &&
    highest !== null
      ? highest - lowest
      : null;

  const image =
    product.image_url ||
    product.imageUrl ||
    product.image ||
    '';

  const name =
    product.name ||
    product.product_name ||
    product.gpu_model ||
    'GPU';

  const brand =
    product.brand ||
    extractBrand(name);

  const vram =
    product.vram || '';

  const memoryType =
    product.memory_type || '';

  container.innerHTML = `

    <section class="compare-product">

      <div class="compare-product-image">

        ${
          image
            ? `
              <img
                src="${escapeAttribute(image)}"
                alt="${escapeHtml(name)}"
              >
            `
            : `
              <span style="
                color:#687789;
                font-size:12px;
              ">
                ไม่มีรูปภาพ
              </span>
            `
        }

      </div>


      <div>

        <div class="compare-product-brand">
          ${escapeHtml(brand)}
        </div>

        <div class="compare-product-name">
          ${escapeHtml(name)}
        </div>


        <div class="compare-specs">

          ${
            vram
              ? `
                <span class="compare-spec">
                  ${escapeHtml(vram)}
                </span>
              `
              : ''
          }

          ${
            memoryType
              ? `
                <span class="compare-spec">
                  ${escapeHtml(memoryType)}
                </span>
              `
              : ''
          }

          <span class="compare-spec">
            ${sortedPrices.length} ร้าน
          </span>

        </div>


        <div class="price-summary">

          <div>

            <div class="price-summary-label">
              ราคาต่ำสุด
            </div>

            <div class="price-summary-main">

              <div class="price-summary-value">
                ${
                  lowest !== null
                    ? formatPrice(lowest)
                    : 'ไม่มีราคา'
                }
              </div>

            </div>

          </div>


          ${
            difference !== null
              ? `
                <div class="price-summary-diff">
                  ส่วนต่างจากราคาสูงสุด
                  <strong>
                    ${formatPrice(difference)}
                  </strong>
                </div>
              `
              : ''
          }

        </div>

      </div>

    </section>


    <section class="price-table-section">

      <div class="price-table-header">

        <h2>
          ราคาจากร้านค้า
        </h2>

        <span>
          อัปเดตตามข้อมูลล่าสุดในระบบ
        </span>

      </div>


      ${
        sortedPrices.length
          ? renderPriceTable(sortedPrices, lowest)
          : `
            <div class="compare-empty"
                 style="border:0;border-radius:0;">
              ยังไม่มีข้อมูลราคาสำหรับ GPU รุ่นนี้
            </div>
          `
      }

    </section>
  `;

}


/* ============================================================
   Price Table
   ============================================================ */

function renderPriceTable(prices, lowest) {

  const rows = prices.map(price => {

    const value = Number(price.price);

    const isLowest =
      value === lowest;

    const store =
      price.store_name ||
      price.store ||
      price.name ||
      'ไม่ระบุร้าน';

    const availability =
      price.availability ||
      'ไม่ระบุสถานะ';

    const productUrl =
      price.product_url ||
      price.productUrl ||
      '';

    return `

      <tr class="${isLowest ? 'lowest-row' : ''}">

        <td class="store-cell">

          ${escapeHtml(store)}

          ${
            isLowest
              ? `
                <span class="lowest-label">
                  ราคาต่ำสุด
                </span>
              `
              : ''
          }

        </td>


        <td class="price-cell">

          ${formatPrice(value)}

        </td>


        <td>

          <span class="availability">
            ${escapeHtml(availability)}
          </span>

        </td>


        <td style="text-align:right;">

          ${
            productUrl
              ? `
                <a
                  class="view-product"
                  href="${escapeAttribute(productUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ดูสินค้า ↗
                </a>
              `
              : `
                <span class="availability">
                  ไม่มีลิงก์
                </span>
              `
          }

        </td>

      </tr>
    `;

  }).join('');


  return `

    <table class="price-table">

      <thead>

        <tr>
          <th>ร้านค้า</th>
          <th>ราคา</th>
          <th>สถานะ</th>
          <th style="text-align:right;">สินค้า</th>
        </tr>

      </thead>

      <tbody>
        ${rows}
      </tbody>

    </table>
  `;
}


/* ============================================================
   Helpers
   ============================================================ */

function formatPrice(value) {

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `฿${number.toLocaleString('th-TH')}`;
}


function extractBrand(name) {

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

  const upper =
    String(name).toUpperCase();

  return brands.find(
    brand => upper.includes(brand)
  ) || 'GPU';
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


function showMessage(message) {

  const container =
    document.getElementById('compareContent');

  container.innerHTML = `
    <div class="compare-empty">
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;

}