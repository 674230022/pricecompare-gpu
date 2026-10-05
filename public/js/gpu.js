// ============================================================
// gpu.js - PriceCompare GPU
// โหลด GPU จาก API และแสดงรายการ
// ============================================================

const API = '/api';

let allGpus = [];
let activeFilter = '';
let activeSort = 'lowest_price';
let currentQuery = '';
let isSearchMode = false;

let currentPage = 1;
const PAGE_SIZE = 12;


// ============================================================
// Utility
// ============================================================

function formatPrice(price) {

  if (price === null || price === undefined || isNaN(price)) {
    return '—';
  }

  return '฿' + Number(price).toLocaleString('th-TH');
}


function timeAgo(dateStr) {

  if (!dateStr) return '—';

  const date = new Date(dateStr);

  if (isNaN(date.getTime())) return '—';

  const diff = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diff < 60) {
    return `${diff} วินาทีที่แล้ว`;
  }

  if (diff < 3600) {
    return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  }

  if (diff < 86400) {
    return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  }

  return `${Math.floor(diff / 86400)} วันที่แล้ว`;
}


// ============================================================
// GPU CARD
// ============================================================

function createGpuCardHTML(gpu) {

  const price =
    gpu.lowest_price !== null &&
    gpu.lowest_price !== undefined
      ? Number(gpu.lowest_price)
      : null;

  const storeCount = Number(gpu.store_count || 0);

  const storeText =
    storeCount > 0
      ? `${storeCount} ร้าน`
      : 'ยังไม่มีราคา';

  const updatedText = timeAgo(gpu.last_updated);

  const gpuModel = gpu.gpu_model || '';

  const specs = [];

  if (gpu.vram) {
    specs.push(gpu.vram);
  }

  if (gpu.memory_type) {
    specs.push(gpu.memory_type);
  }

  const specsHTML = specs
    .map(spec => `<span class="gpu-card-spec">${spec}</span>`)
    .join('');

  const image =
    gpu.image_url ||
    '/img/gpu-placeholder.jpg';

  const priceHTML =
    price !== null && !isNaN(price)
      ? `<div class="price-value">${formatPrice(price)}</div>`
      : `<div class="price-value no-price">ไม่มีข้อมูล</div>`;

  return `

    <article class="gpu-card">

      <div class="gpu-card-img">

        <img
          src="${image}"
          alt="${gpu.name || 'GPU'}"
          loading="lazy"
          onerror="this.onerror=null;this.src='/img/gpu-placeholder.jpg';"
        />

        <div class="card-badge-img">

          <span class="badge badge-primary">
            ${gpuModel || 'GPU'}
          </span>

        </div>

      </div>


      <div class="gpu-card-body">

        <div class="gpu-card-brand">
          ${gpu.brand || 'Unknown'}
        </div>

        <h3 class="gpu-card-name">
          ${gpu.name || 'ไม่ระบุชื่อสินค้า'}
        </h3>

        <div class="gpu-card-specs">
          ${specsHTML}
        </div>

        <div class="gpu-card-price">

          <div class="price-label">
            ราคาต่ำสุด
          </div>

          ${priceHTML}

          <div class="price-meta">

            <span class="price-stores">
              🏪 ${storeText}
            </span>

            <span class="price-updated">
              🕐 ${updatedText}
            </span>

          </div>

        </div>

      </div>


      <div class="gpu-card-footer">

        <a
          href="compare.html?id=${gpu.id}"
          class="btn btn-primary btn-sm"
        >
          📊 เปรียบเทียบ
        </a>

        <button
          class="btn btn-outline btn-sm"
          data-gpu-detail="${gpu.id}"
        >
          รายละเอียด
        </button>

      </div>

    </article>

  `;
}


// ============================================================
// RENDER GPU
// ============================================================

function renderGpus() {

  const grid = document.getElementById('gpuGrid');
  const status = document.getElementById('searchStatus');

  if (!grid) {
    console.error('ไม่พบ #gpuGrid');
    return;
  }


  // -----------------------------
  // Filter
  // -----------------------------

  let list = [...allGpus];

  if (!isSearchMode && activeFilter) {

    list = list.filter(gpu => {

      return String(gpu.brand || '').toUpperCase()
        === activeFilter.toUpperCase();

    });

  }


  // -----------------------------
  // Sort
  // -----------------------------

  list.sort((a, b) => {

    const priceA =
      a.lowest_price !== null &&
      a.lowest_price !== undefined
        ? Number(a.lowest_price)
        : 999999999;

    const priceB =
      b.lowest_price !== null &&
      b.lowest_price !== undefined
        ? Number(b.lowest_price)
        : 999999999;


    if (activeSort === 'lowest_price') {
      return priceA - priceB;
    }


    if (activeSort === 'highest_price') {
      return priceB - priceA;
    }


    if (activeSort === 'name') {

      return String(a.name || '')
        .localeCompare(
          String(b.name || ''),
          'th'
        );

    }


    if (activeSort === 'updated') {

      return new Date(b.last_updated || 0)
        - new Date(a.last_updated || 0);

    }


    return 0;

  });


  // -----------------------------
  // Pagination
  // -----------------------------

  const total = list.length;

  const pages = Math.ceil(
    total / PAGE_SIZE
  );

  if (pages > 0) {

    currentPage = Math.min(
      currentPage,
      pages
    );

  } else {

    currentPage = 1;

  }


  const start =
    (currentPage - 1) * PAGE_SIZE;

  const paged =
    list.slice(
      start,
      start + PAGE_SIZE
    );


  // -----------------------------
  // Status
  // -----------------------------

  if (status) {

    if (isSearchMode && currentQuery) {

      status.innerHTML =
        `ผลการค้นหา
        "<strong style="color:var(--primary-light)">
          ${currentQuery}
        </strong>"
        — พบ
        <strong>${total}</strong>
        รายการ`;

    } else {

      status.innerHTML =
        `แสดง
        <strong>${total === 0 ? 0 : start + 1}</strong>
        -
        <strong>${Math.min(start + PAGE_SIZE, total)}</strong>
        จาก
        <strong>${total}</strong>
        รายการ`;

    }

  }


  // -----------------------------
  // Empty
  // -----------------------------

  if (paged.length === 0) {

    grid.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          ${isSearchMode ? '🔍' : '🖥️'}
        </div>

        <h3>
          ${
            isSearchMode
              ? `ไม่พบ GPU สำหรับ "${currentQuery}"`
              : 'ไม่พบ GPU'
          }
        </h3>

        <p>
          ${
            isSearchMode
              ? 'ลองค้นหาด้วยคำอื่น เช่น RTX 5070'
              : 'ยังไม่มีข้อมูล GPU'
          }
        </p>

      </div>

    `;

    renderPagination(0);

    return;
  }


  // -----------------------------
  // Render cards
  // -----------------------------

  grid.innerHTML = paged
    .map(gpu => createGpuCardHTML(gpu))
    .join('');


  // -----------------------------
  // Detail buttons
  // -----------------------------

  grid
    .querySelectorAll('[data-gpu-detail]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const id =
            button.dataset.gpuDetail;

          openGpuModal(id);

        }
      );

    });


  renderPagination(pages);
}


// ============================================================
// PAGINATION
// ============================================================

function renderPagination(pages) {

  const pagination =
    document.getElementById('pagination');

  if (!pagination) return;

  if (pages <= 1) {

    pagination.innerHTML = '';

    return;
  }


  let html = '';


  // Previous

  html += `

    <button
      class="btn btn-ghost btn-sm"
      ${currentPage === 1 ? 'disabled' : ''}
      onclick="goPage(${currentPage - 1})"
    >
      ← ก่อนหน้า
    </button>

  `;


  // Pages

  for (let i = 1; i <= pages; i++) {

    html += `

      <button
        class="btn btn-sm ${
          i === currentPage
            ? 'btn-primary'
            : 'btn-ghost'
        }"
        onclick="goPage(${i})"
      >
        ${i}
      </button>

    `;

  }


  // Next

  html += `

    <button
      class="btn btn-ghost btn-sm"
      ${currentPage === pages ? 'disabled' : ''}
      onclick="goPage(${currentPage + 1})"
    >
      ถัดไป →
    </button>

  `;

  pagination.innerHTML = html;
}


function goPage(page) {

  if (page < 1) {
    return;
  }

  currentPage = page;

  renderGpus();

  window.scrollTo({
    top: 300,
    behavior: 'smooth'
  });

}


// ============================================================
// LOAD ALL GPU
// ============================================================

async function loadAllGpus() {

  const grid =
    document.getElementById('gpuGrid');

  if (!grid) return;


  // แสดง Loading

  grid.innerHTML = `

    <div
      style="
        grid-column:1/-1;
        text-align:center;
        padding:60px;
        color:var(--text-muted);
      "
    >
      ⏳ กำลังโหลดข้อมูล GPU...
    </div>

  `;


  try {

    console.log('[gpu.js] กำลังโหลด /api/gpus');


    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        10000
      );


    const response =
      await fetch(
        `${API}/gpus?limit=100`,
        {
          signal: controller.signal,
          cache: 'no-store'
        }
      );


    clearTimeout(timeout);


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const result =
      await response.json();


    console.log(
      '[gpu.js] API result:',
      result
    );


    if (!result.success) {

      throw new Error(
        result.error ||
        'API ไม่สำเร็จ'
      );

    }


    // สำคัญมาก

    allGpus =
      Array.isArray(result.data)
        ? result.data
        : [];


    console.log(
      '[gpu.js] GPU ทั้งหมด:',
      allGpus.length
    );


    if (allGpus.length === 0) {

      grid.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">
            📦
          </div>

          <h3>
            ไม่มีข้อมูล GPU
          </h3>

          <p>
            API ไม่ได้ส่งรายการ GPU กลับมา
          </p>

        </div>

      `;

      return;
    }


    // Render

    renderGpus();


  } catch (error) {

    console.error(
      '[gpu.js] โหลด GPU ไม่สำเร็จ:',
      error
    );


    grid.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          ❌
        </div>

        <h3>
          โหลดข้อมูล GPU ไม่สำเร็จ
        </h3>

        <p>
          ${error.message}
        </p>

      </div>

    `;

  }

}


// ============================================================
// SEARCH
// ============================================================

async function doSearch(query) {

  const q =
    String(query || '').trim();


  if (!q) {

    isSearchMode = false;

    currentQuery = '';

    currentPage = 1;

    renderGpus();

    return;
  }


  const grid =
    document.getElementById('gpuGrid');

  if (!grid) return;


  isSearchMode = true;

  currentQuery = q;

  currentPage = 1;


  grid.innerHTML = `

    <div
      style="
        grid-column:1/-1;
        text-align:center;
        padding:60px;
        color:var(--text-muted);
      "
    >
      🔍 กำลังค้นหา "${q}"...
    </div>

  `;


  try {

    const response =
      await fetch(
        `${API}/gpus/search?q=${encodeURIComponent(q)}`,
        {
          cache: 'no-store'
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const result =
      await response.json();


    console.log(
      '[gpu.js] Search result:',
      result
    );


    if (!result.success) {

      throw new Error(
        result.error ||
        'ค้นหาไม่สำเร็จ'
      );

    }


    allGpus =
      Array.isArray(result.data)
        ? result.data
        : [];


    renderGpus();


  } catch (error) {

    console.error(
      '[gpu.js] search error:',
      error
    );


    grid.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          ❌
        </div>

        <h3>
          ค้นหาไม่สำเร็จ
        </h3>

        <p>
          ${error.message}
        </p>

      </div>

    `;

  }

}


// ============================================================
// GPU DETAIL MODAL
// ============================================================

async function openGpuModal(id) {

  const modal =
    document.getElementById('gpuModal');

  const content =
    document.getElementById('modalContent');


  if (!modal || !content) {
    return;
  }


  modal.style.display = 'flex';

  modal.classList.remove('hidden');

  document.body.style.overflow = 'hidden';


  content.innerHTML = `

    <div
      style="
        padding:60px;
        text-align:center;
        color:var(--text-muted);
      "
    >
      ⏳ กำลังโหลดข้อมูล...
    </div>

  `;


  try {

    const response =
      await fetch(
        `${API}/gpus/${id}`,
        {
          cache: 'no-store'
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const result =
      await response.json();


    if (!result.success) {

      throw new Error(
        result.error ||
        'โหลดข้อมูลไม่สำเร็จ'
      );

    }


    const gpu =
      result.data || {};

    const prices =
      Array.isArray(gpu.prices)
        ? gpu.prices
        : [];

    const stats =
      gpu.stats || {};


    const image =
      gpu.image_url ||
      '/img/gpu-placeholder.jpg';


    // ========================================================
    // FILTER ADVICE
    // ตัด Advice ออกจากการแสดงผลหน้าเว็บ
    // ========================================================

    const filteredPrices =
      prices.filter(price => {

        const storeName =
          String(price.store_name || '')
            .trim()
            .toUpperCase();

        return !storeName.includes('ADVICE');

      });


    const priceRows =
      filteredPrices
        .map(price => {

          const isLowest =
            price.is_lowest ||
            Number(price.price) ===
            Number(stats.lowestPrice);


          return `

            <div
              class="store-price-row ${
                isLowest ? 'lowest' : ''
              }"
            >

              <div class="store-name-col">

                <div class="store-name-label">
                  ${price.store_name || '-'}
                </div>

                <div class="store-avail">

                  ${
                    price.availability === 'available'
                      ? '✅ มีสินค้า'
                      : '❓ ไม่ทราบสถานะ'
                  }

                </div>

              </div>


              <div class="store-price-col">

                <div
                  class="store-price-num"
                  style="
                    color:${
                      isLowest
                        ? 'var(--green)'
                        : 'var(--text-primary)'
                    };
                  "
                >
                  ${formatPrice(price.price)}
                </div>

              </div>


              <div class="store-btn-col">

                ${
                  price.product_url
                    ? `

                      <a
                        href="${price.product_url}"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-primary btn-sm"
                      >
                        ดูสินค้า ↗
                      </a>

                    `
                    : ''
                }

              </div>

            </div>

          `;

        })
        .join('');


    content.innerHTML = `

      <div class="modal-header">

        <div class="modal-img">

          <img
            src="${image}"
            alt="${gpu.name || 'GPU'}"
            onerror="
              this.onerror=null;
              this.src='/img/gpu-placeholder.jpg';
            "
          />

        </div>


        <div class="modal-info">

          <div class="brand">
            ${gpu.brand || 'Unknown'}
          </div>

          <h2>
            ${gpu.name || 'GPU'}
          </h2>


          <div class="modal-specs">

            ${
              gpu.vram
                ? `
                  <span class="gpu-card-spec">
                    ${gpu.vram}
                  </span>
                `
                : ''
            }

            ${
              gpu.memory_type
                ? `
                  <span class="gpu-card-spec">
                    ${gpu.memory_type}
                  </span>
                `
                : ''
            }

            ${
              gpu.gpu_model
                ? `
                  <span class="gpu-card-spec">
                    ${gpu.gpu_model}
                  </span>
                `
                : ''
            }

          </div>


          <div
            style="
              display:flex;
              gap:30px;
              margin-top:10px;
            "
          >

            <div>

              <div
                style="
                  font-size:.72rem;
                  color:var(--text-muted);
                "
              >
                ราคาต่ำสุด
              </div>

              <div
                style="
                  font-size:1.5rem;
                  font-weight:700;
                  color:var(--green);
                "
              >
                ${formatPrice(stats.lowestPrice)}
              </div>

            </div>


            <div>

              <div
                style="
                  font-size:.72rem;
                  color:var(--text-muted);
                "
              >
                ส่วนต่าง
              </div>

              <div
                style="
                  font-size:1.5rem;
                  font-weight:700;
                  color:var(--orange);
                "
              >
                ${formatPrice(stats.priceDiff)}
              </div>

            </div>

          </div>

        </div>

      </div>


      <div class="modal-body">

        <div class="modal-prices-title">
          💰 ราคาจากทุกร้าน
        </div>

        ${
          priceRows ||
          '<p style="color:var(--text-muted)">ยังไม่มีข้อมูลราคา</p>'
        }

      </div>


      <div class="modal-footer">

        <a
          href="history.html?id=${gpu.id}"
          class="btn btn-outline btn-sm"
        >
          📈 ประวัติราคา
        </a>

        <a
          href="compare.html?id=${gpu.id}"
          class="btn btn-primary btn-sm"
        >
          📊 เปรียบเทียบ
        </a>

      </div>

    `;


  } catch (error) {

    console.error(
      '[gpu.js] detail error:',
      error
    );


    content.innerHTML = `

      <div
        style="
          padding:60px;
          text-align:center;
          color:var(--red);
        "
      >

        ❌ โหลดข้อมูลไม่สำเร็จ

        <br>

        ${error.message}

      </div>

    `;

  }

}


function closeGpuModal() {

  const modal =
    document.getElementById('gpuModal');

  if (!modal) return;

  modal.style.display = 'none';

  modal.classList.add('hidden');

  document.body.style.overflow = '';

}


// ============================================================
// INIT
// ============================================================

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    console.log(
      '✅ gpu.js เริ่มทำงาน'
    );


    // -------------------------
    // Navbar
    // -------------------------

    const navbar =
      document.getElementById('navbar');

    const navToggle =
      document.getElementById('navToggle');

    const navLinks =
      document.getElementById('navLinks');

    const scrollTop =
      document.getElementById('scrollTop');


    if (navbar) {

      window.addEventListener(
        'scroll',
        () => {

          navbar.classList.toggle(
            'scrolled',
            window.scrollY > 20
          );


          if (scrollTop) {

            scrollTop.classList.toggle(
              'visible',
              window.scrollY > 400
            );

          }

        }
      );

    }


    if (navToggle && navLinks) {

      navToggle.addEventListener(
        'click',
        () => {

          navLinks.classList.toggle(
            'open'
          );

        }
      );

    }


    if (scrollTop) {

      scrollTop.addEventListener(
        'click',
        () => {

          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          });

        }
      );

    }


    // -------------------------
    // Search
    // -------------------------

    const searchForm =
      document.getElementById('searchForm');

    const searchInput =
      document.getElementById('searchInput');


    if (searchForm) {

      searchForm.addEventListener(
        'submit',
        event => {

          event.preventDefault();

          doSearch(
            searchInput
              ? searchInput.value
              : ''
          );

        }
      );

    }


    // -------------------------
    // Quick tags
    // -------------------------

    document
      .querySelectorAll('.quick-tag')
      .forEach(tag => {

        tag.addEventListener(
          'click',
          () => {

            doSearch(
              tag.dataset.q
            );

          }
        );

      });


    // -------------------------
    // Brand filters
    // -------------------------

    const brandFilters =
      document.getElementById(
        'brandFilters'
      );


    if (brandFilters) {

      brandFilters.addEventListener(
        'click',
        event => {

          const chip =
            event.target.closest(
              '.filter-chip'
            );

          if (!chip) return;


          activeFilter =
            chip.dataset.brand || '';

          isSearchMode = false;

          currentQuery = '';

          currentPage = 1;


          if (searchInput) {
            searchInput.value = '';
          }


          document
            .querySelectorAll(
              '.filter-chip'
            )
            .forEach(item => {

              item.classList.remove(
                'active'
              );

            });


          chip.classList.add('active');


          renderGpus();

        }
      );

    }


    // -------------------------
    // Sort
    // -------------------------

    const sortSelect =
      document.getElementById(
        'sortSelect'
      );


    if (sortSelect) {

      sortSelect.addEventListener(
        'change',
        event => {

          activeSort =
            event.target.value;

          currentPage = 1;

          renderGpus();

        }
      );

    }


    // -------------------------
    // Modal
    // -------------------------

    const modal =
      document.getElementById(
        'gpuModal'
      );

    const modalClose =
      document.getElementById(
        'modalClose'
      );


    if (modalClose) {

      modalClose.addEventListener(
        'click',
        closeGpuModal
      );

    }


    if (modal) {

      modal.addEventListener(
        'click',
        event => {

          if (event.target === modal) {
            closeGpuModal();
          }

        }
      );

    }


    document.addEventListener(
      'keydown',
      event => {

        if (event.key === 'Escape') {
          closeGpuModal();
        }

      }
    );


    // -------------------------
    // LOAD GPU
    // -------------------------

    await loadAllGpus();


    // URL search

    const params =
      new URLSearchParams(
        window.location.search
      );

    const query =
      params.get('q');

    const id =
      params.get('id');


    if (query) {

      await doSearch(query);

    } else if (id) {

      await openGpuModal(id);

    }

  }
);