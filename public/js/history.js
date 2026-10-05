/**
 * history.js - Price History Page
 * ใช้ Chart.js วาด Line Chart ราคาย้อนหลังแยกตามร้าน
 */

const API = '/api';

// ══════════════════════════════════════════════════
// Utility
// ══════════════════════════════════════════════════

function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  return '฿' + Number(price).toLocaleString('th-TH');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Store Colors สำหรับ Chart.js ─────────────────
const STORE_CHART_COLORS = {
  'JIB':      { line: '#e53935', bg: 'rgba(229,57,53,.08)',   point: '#e53935' },
  'Advice':   { line: '#1e88e5', bg: 'rgba(30,136,229,.08)',  point: '#1e88e5' },
  'BaNANA':   { line: '#fdd835', bg: 'rgba(253,216,53,.08)',  point: '#fdd835' },
  'iHAVECPU': { line: '#43a047', bg: 'rgba(67,160,71,.08)',   point: '#43a047' },
};

function getStoreColor(storeName) {
  return STORE_CHART_COLORS[storeName] || {
    line: '#6c63ff', bg: 'rgba(108,99,255,.08)', point: '#6c63ff',
  };
}

// ══════════════════════════════════════════════════
// Navbar
// ══════════════════════════════════════════════════

const navbar    = document.getElementById('navbar');
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
  document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
});
navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
document.getElementById('scrollTop').addEventListener('click', () =>
  window.scrollTo({ top: 0, behavior: 'smooth' })
);

// ══════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════

let allGpus       = [];
let currentGpuId  = null;
let currentDays   = 14;
let historyData   = [];       // raw history groups
let visibleStores = new Set(); // ร้านที่ toggle เปิดอยู่
let priceChart    = null;     // Chart.js instance

// ══════════════════════════════════════════════════
// GPU Selector / Autocomplete
// ══════════════════════════════════════════════════

const selectorInput  = document.getElementById('gpuSelectorInput');
const suggestionsBox = document.getElementById('gpuSuggestions');
let suggestionTimer  = null;
let highlightIndex   = -1;

selectorInput.addEventListener('input', () => {
  clearTimeout(suggestionTimer);
  const q = selectorInput.value.trim();
  if (q.length < 2) { closeSuggestions(); return; }
  suggestionTimer = setTimeout(() => fetchSuggestions(q), 250);
});

selectorInput.addEventListener('keydown', (e) => {
  const items = suggestionsBox.querySelectorAll('.suggestion-item:not(.suggestion-empty)');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); highlightIndex = Math.min(highlightIndex + 1, items.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlightIndex = Math.max(highlightIndex - 1, 0); }
  else if (e.key === 'Enter') { e.preventDefault(); if (items[highlightIndex]) items[highlightIndex].click(); }
  else if (e.key === 'Escape') { closeSuggestions(); }
  items.forEach((item, i) => item.classList.toggle('active', i === highlightIndex));
});

document.addEventListener('click', (e) => {
  if (!selectorInput.contains(e.target) && !suggestionsBox.contains(e.target)) closeSuggestions();
});

function closeSuggestions() {
  suggestionsBox.classList.remove('open');
  suggestionsBox.innerHTML = '';
  highlightIndex = -1;
}

async function fetchSuggestions(q) {
  try {
    const res  = await fetch(`${API}/gpus/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.success || !data.data.length) {
      suggestionsBox.innerHTML = `<div class="suggestion-empty">ไม่พบ GPU ที่ตรงกับ "${q}"</div>`;
      suggestionsBox.classList.add('open');
      return;
    }
    suggestionsBox.innerHTML = data.data.slice(0, 7).map(g => `
      <div class="suggestion-item" data-gpu-id="${g.id}">
        <span class="suggestion-model">${g.gpu_model}</span>
        <span class="suggestion-name">${g.name}</span>
        <span class="suggestion-price">${g.lowest_price ? formatPrice(g.lowest_price) : '—'}</span>
      </div>`).join('');
    suggestionsBox.classList.add('open');
    highlightIndex = -1;
    suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        closeSuggestions();
        selectorInput.value = '';
        loadGpuHistory(item.dataset.gpuId, currentDays);
      });
    });
  } catch (err) { console.error('Suggestion error:', err); }
}

// ══════════════════════════════════════════════════
// Load All GPUs → Quick list
// ══════════════════════════════════════════════════

async function loadAllGpus() {
  try {
    const res  = await fetch(`${API}/gpus?limit=100`);
    const data = await res.json();
    allGpus    = data.data || [];
    renderQuickList();
  } catch (err) { console.error('Load gpus error:', err); }
}

function renderQuickList() {
  const el = document.getElementById('quickGpuList');
  if (!el || !allGpus.length) return;
  const list = allGpus.filter(g => g.lowest_price).slice(0, 8);
  el.innerHTML = list.map(g => `
    <button class="quick-gpu-btn" data-gpu-id="${g.id}">
      ${g.gpu_model}
    </button>`).join('');
  el.querySelectorAll('.quick-gpu-btn').forEach(btn => {
    btn.addEventListener('click', () => loadGpuHistory(btn.dataset.gpuId, currentDays));
  });
}

// ══════════════════════════════════════════════════
// Load GPU History
// ══════════════════════════════════════════════════

async function loadGpuHistory(gpuId, days) {
  currentGpuId = gpuId;
  currentDays  = days;
  showHistoryResult();
  showChartLoading(true);

  try {
    // โหลดข้อมูล GPU และ history พร้อมกัน
    const [gpuRes, histRes] = await Promise.all([
      fetch(`${API}/gpus/${gpuId}`),
      fetch(`${API}/gpus/${gpuId}/history?days=${days}`),
    ]);
    const gpuData  = await gpuRes.json();
    const histData = await histRes.json();

    if (!gpuData.success)  throw new Error(gpuData.error);
    if (!histData.success) throw new Error(histData.error);

    const gpu  = gpuData.data;
    historyData = histData.history || [];

    // อัปเดต UI
    renderGpuInfo(gpu);
    renderStoreToggles(historyData);
    renderChart(historyData, gpu.name);
    renderStatsRow(historyData);
    renderHistoryTable(historyData);

    document.getElementById('viewCompareBtn').href = `compare.html?id=${gpuId}`;
    document.getElementById('chartTitle').textContent    = gpu.gpu_model;
    document.getElementById('chartSubtitle').textContent = `ประวัติราคาย้อนหลัง ${days} วัน`;

    // อัปเดต URL
    const url = new URL(window.location);
    url.searchParams.set('id', gpuId);
    url.searchParams.set('days', days);
    window.history.pushState({}, '', url);

  } catch (err) {
    showChartLoading(false);
    showToast(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`, 'error');
    console.error('History error:', err);
  }
}

function showHistoryResult() {
  document.getElementById('historyEmpty').classList.add('hidden');
  document.getElementById('historyResult').classList.remove('hidden');
  window.scrollTo({ top: 280, behavior: 'smooth' });
}

function showChartLoading(show) {
  document.getElementById('chartLoading').classList.toggle('hidden', !show);
}

// ══════════════════════════════════════════════════
// Render GPU Info
// ══════════════════════════════════════════════════

function renderGpuInfo(gpu) {
  const specs = [
    gpu.vram        && `<span class="gpu-card-spec">💾 ${gpu.vram}</span>`,
    gpu.memory_type && `<span class="gpu-card-spec">🔧 ${gpu.memory_type}</span>`,
  ].filter(Boolean).join('');

  document.getElementById('historyGpuInfo').innerHTML = `
    <div class="history-gpu-img">
      ${gpu.image_url
        ? `<img src="${gpu.image_url}" alt="${gpu.name}"
                onerror="this.outerHTML='<div class=\\'fallback\\' style=\\'font-size:2rem;opacity:.15;\\'>🖥️</div>'">`
        : `<div class="fallback" style="font-size:2rem;opacity:.15;">🖥️</div>`}
    </div>
    <div class="history-gpu-text">
      <div class="history-gpu-brand">${gpu.brand}</div>
      <div class="history-gpu-name">${gpu.name}</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">${specs}</div>
    </div>`;
}

// ══════════════════════════════════════════════════
// Store Toggle Buttons
// ══════════════════════════════════════════════════

function renderStoreToggles(groups) {
  const el = document.getElementById('storeToggles');
  visibleStores = new Set(groups.map(g => g.storeName));

  el.innerHTML = groups.map(group => {
    const c = getStoreColor(group.storeName);
    return `
      <button class="store-toggle active" data-store="${group.storeName}"
              style="border-color:${c.line}20;">
        <span class="dot" style="background:${c.line};box-shadow:0 0 6px ${c.line}60;"></span>
        ${group.storeName}
      </button>`;
  }).join('');

  // Attach toggle events
  el.querySelectorAll('.store-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const store = btn.dataset.store;
      if (visibleStores.has(store)) {
        // ห้ามปิดทั้งหมด ต้องมีอย่างน้อย 1
        if (visibleStores.size <= 1) return;
        visibleStores.delete(store);
        btn.classList.remove('active');
        btn.classList.add('disabled');
      } else {
        visibleStores.add(store);
        btn.classList.add('active');
        btn.classList.remove('disabled');
      }
      updateChart();
    });
  });
}

// ══════════════════════════════════════════════════
// Chart.js Render
// ══════════════════════════════════════════════════

function renderChart(groups, gpuName) {
  showChartLoading(false);

  // ตรวจสอบว่ามีข้อมูลหรือไม่
  const hasData = groups.some(g => g.data && g.data.length > 0);
  const chartArea = document.getElementById('chartArea');

  if (!hasData) {
    if (priceChart) { priceChart.destroy(); priceChart = null; }
    chartArea.innerHTML = `
      <div class="chart-no-data">
        <div class="icon">📊</div>
        <div>ยังไม่มีข้อมูลประวัติราคา</div>
        <div style="font-size:.8rem;color:var(--text-muted);">ระบบจะเริ่มเก็บข้อมูลหลังจาก Scraper ทำงานครั้งแรก</div>
      </div>`;
    return;
  }

  // คืน canvas ถ้าถูก replace
  if (!document.getElementById('priceChart')) {
    chartArea.innerHTML = '<canvas id="priceChart"></canvas>';
  }

  const ctx = document.getElementById('priceChart').getContext('2d');

  // Destroy chart เดิมก่อน
  if (priceChart) { priceChart.destroy(); priceChart = null; }

  // สร้าง datasets
  const datasets = groups.map(group => {
    const c = getStoreColor(group.storeName);
    return {
      label:           group.storeName,
      data:            group.data.map(d => ({ x: new Date(d.date), y: d.price })),
      borderColor:     c.line,
      backgroundColor: c.bg,
      pointBackgroundColor: c.point,
      pointBorderColor:     c.line,
      pointRadius:          4,
      pointHoverRadius:     7,
      borderWidth:          2.5,
      tension:              0.35,
      fill:                 false,
    };
  });

  // คำนวณ Y-axis range
  const allPrices = groups.flatMap(g => g.data.map(d => d.price)).filter(Boolean);
  const minP  = Math.min(...allPrices);
  const maxP  = Math.max(...allPrices);
  const padP  = (maxP - minP) * 0.1 || 1000;
  const yMin  = Math.floor((minP - padP) / 1000) * 1000;
  const yMax  = Math.ceil((maxP + padP)  / 1000) * 1000;

  priceChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 600, easing: 'easeInOutQuart' },
      interaction: {
        mode:      'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,17,28,0.95)',
          borderColor:     'rgba(108,99,255,0.4)',
          borderWidth:     1,
          padding:         14,
          titleFont:       { family: 'Inter', size: 13, weight: '600' },
          bodyFont:        { family: 'Inter', size: 13 },
          titleColor:      '#e8eaf0',
          bodyColor:       '#94a3b8',
          cornerRadius:    10,
          callbacks: {
            title: (items) => {
              const date = new Date(items[0].parsed.x);
              return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
            },
            label: (item) => {
              const val = item.parsed.y;
              return ` ${item.dataset.label}: ${formatPrice(val)}`;
            },
          },
        },
      },
      scales: {
        x: {
          type:    'time',
          time: {
            unit:         'day',
            tooltipFormat:'dd/MM/yyyy',
            displayFormats:{ day: 'dd MMM' },
          },
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { family: 'Inter', size: 11 }, maxTicksLimit: 10 },
          border:{ color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          min:   yMin,
          max:   yMax,
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#64748b',
            font:  { family: 'Inter', size: 11 },
            callback: (val) => '฿' + val.toLocaleString('th-TH'),
          },
          border:{ color: 'rgba(255,255,255,0.06)' },
        },
      },
    },
  });

  // Render legend
  renderLegend(groups);
}

function renderLegend(groups) {
  const el = document.getElementById('chartLegend');
  el.innerHTML = groups.map(group => {
    const c = getStoreColor(group.storeName);
    return `
      <div class="legend-item">
        <span class="legend-dot" style="background:${c.line};box-shadow:0 0 6px ${c.line}60;"></span>
        ${group.storeName}
      </div>`;
  }).join('');
}

function updateChart() {
  if (!priceChart) return;
  // ซ่อน/แสดง dataset ตาม visibleStores
  priceChart.data.datasets.forEach(ds => {
    const meta = priceChart.getDatasetMeta(priceChart.data.datasets.indexOf(ds));
    meta.hidden = !visibleStores.has(ds.label);
  });
  priceChart.update();
}

// ══════════════════════════════════════════════════
// Stats Row
// ══════════════════════════════════════════════════

function renderStatsRow(groups) {
  const el = document.getElementById('historyStatsRow');
  const allPrices = groups.flatMap(g => g.data.map(d => d.price)).filter(Boolean);

  if (!allPrices.length) { el.style.display = 'none'; return; }

  el.style.display = 'grid';

  const minP  = Math.min(...allPrices);
  const maxP  = Math.max(...allPrices);
  const avgP  = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;

  // หา first และ last price (ทุกร้าน) เพื่อคำนวณ change
  const allSorted = groups.flatMap(g => g.data).sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstP = allSorted[0]?.price;
  const lastP  = allSorted[allSorted.length - 1]?.price;
  const change = (firstP && lastP) ? lastP - firstP : null;
  const changePct = (firstP && change != null) ? ((change / firstP) * 100).toFixed(1) : null;

  document.getElementById('hstatMin').textContent = formatPrice(minP);
  document.getElementById('hstatMax').textContent = formatPrice(maxP);
  document.getElementById('hstatAvg').textContent = formatPrice(Math.round(avgP));

  const changeEl = document.getElementById('hstatChange');
  if (change != null) {
    const sign   = change >= 0 ? '+' : '';
    const arrow  = change >= 0 ? '↑' : '↓';
    changeEl.textContent = `${arrow} ${sign}${formatPrice(Math.abs(change))} (${sign}${changePct}%)`;
    changeEl.className   = `hstat-value ${change <= 0 ? 'green' : 'red'}`;
  } else {
    changeEl.textContent = '—';
    changeEl.className   = 'hstat-value';
  }
}

// ══════════════════════════════════════════════════
// History Table
// ══════════════════════════════════════════════════

function renderHistoryTable(groups) {
  if (!groups.length) return;

  // สร้าง header columns ตามร้าน
  const storeNames = groups.map(g => g.storeName);
  storeNames.forEach((name, i) => {
    const el = document.getElementById(`th-store-${i + 1}`);
    if (el) {
      const c = getStoreColor(name);
      el.innerHTML = `<span style="color:${c.line}">${name}</span>`;
    }
  });
  // ซ่อน header ที่ไม่ใช้
  for (let i = storeNames.length + 1; i <= 4; i++) {
    const el = document.getElementById(`th-store-${i}`);
    if (el) el.style.display = 'none';
  }

  // รวมวันที่ทั้งหมด (unique)
  const dateSet = new Set();
  groups.forEach(g => g.data.forEach(d => dateSet.add(d.date)));
  const dates = [...dateSet].sort((a, b) => new Date(b) - new Date(a)); // ใหม่ก่อน

  // สร้าง map ราคาต่อวันของแต่ละร้าน
  const priceByStoreDate = {};
  groups.forEach(group => {
    priceByStoreDate[group.storeName] = {};
    group.data.forEach(d => { priceByStoreDate[group.storeName][d.date] = d.price; });
  });

  // Render rows
  const tbody = document.getElementById('historyTableBody');
  const rows  = dates.slice(0, 30).map((date, rowIdx) => {
    const prevDate = dates[rowIdx + 1];

    const cells = storeNames.map(store => {
      const price     = priceByStoreDate[store]?.[date];
      const prevPrice = prevDate ? priceByStoreDate[store]?.[prevDate] : null;

      if (price == null) return `<td class="td-no-data">—</td>`;

      // Price change indicator
      let changeHTML = '';
      if (prevPrice != null && price !== prevPrice) {
        const diff  = price - prevPrice;
        const sign  = diff > 0 ? '+' : '';
        const cls   = diff > 0 ? 'td-change-up' : 'td-change-down';
        const arrow = diff > 0 ? '▲' : '▼';
        changeHTML = `<div class="${cls}">${arrow} ${sign}${formatPrice(Math.abs(diff))}</div>`;
      }

      return `<td class="td-price">${formatPrice(price)}${changeHTML}</td>`;
    }).join('');

    return `<tr><td class="td-date">${formatDate(date)}</td>${cells}</tr>`;
  }).join('');

  tbody.innerHTML = rows || `<tr><td colspan="${storeNames.length + 1}" style="text-align:center;color:var(--text-muted);padding:30px;">ไม่มีข้อมูลในช่วงนี้</td></tr>`;

  document.getElementById('tableInfo').textContent = `แสดง ${Math.min(dates.length, 30)} จาก ${dates.length} วัน`;
}

// ══════════════════════════════════════════════════
// Days Tab Events
// ══════════════════════════════════════════════════

document.getElementById('daysTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.days-tab');
  if (!tab || !currentGpuId) return;

  document.querySelectorAll('.days-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentDays = parseInt(tab.dataset.days);
  loadGpuHistory(currentGpuId, currentDays);
});

// ══════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════

async function init() {
  await loadAllGpus();

  // ตรวจสอบ URL params
  const params = new URLSearchParams(window.location.search);
  const urlId  = params.get('id');
  const urlDays= parseInt(params.get('days')) || 14;

  if (urlId) {
    // อัปเดต active tab ถ้า days ถูกกำหนดใน URL
    document.querySelectorAll('.days-tab').forEach(t => {
      t.classList.toggle('active', parseInt(t.dataset.days) === urlDays);
    });
    currentDays = urlDays;
    await loadGpuHistory(urlId, urlDays);
  }
}

document.addEventListener('DOMContentLoaded', init);
