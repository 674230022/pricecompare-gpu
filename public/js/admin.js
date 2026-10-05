/**
 * admin.js - Admin Dashboard JavaScript
 * ตรวจสอบสถานะ, ควบคุม Scraper, แสดง Logs และ Price Data
 */

const API = '/api';

// ══════════════════════════════════════════════════
// Utility
// ══════════════════════════════════════════════════

function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  return '฿' + Number(price).toLocaleString('th-TH');
}

function formatDatetime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff}s ที่แล้ว`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m ที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ที่แล้ว`;
  return `${Math.floor(diff/86400)}d ที่แล้ว`;
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function animateNum(el, target) {
  if (!el || isNaN(target)) return;
  const duration = 600;
  const start    = Date.now();
  function tick() {
    const t = Math.min((Date.now() - start) / duration, 1);
    const v = Math.floor(t * target);
    el.textContent = v.toLocaleString('th-TH');
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Store display config
const STORE_CONFIG = {
  'JIB':      { bg:'rgba(229,57,53,.15)',   color:'#e53935' },
  'Advice':   { bg:'rgba(30,136,229,.15)',  color:'#1e88e5' },
  'BaNANA':   { bg:'rgba(253,216,53,.15)',  color:'#fdd835' },
  'iHAVECPU': { bg:'rgba(67,160,71,.15)',   color:'#43a047' },
};
function getStoreStyle(name) {
  return STORE_CONFIG[name] || { bg:'rgba(255,255,255,.08)', color:'var(--text-primary)' };
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
// Load System Status (/api/status)
// ══════════════════════════════════════════════════

async function loadStatus() {
  try {
    const res  = await fetch(`${API}/status`);
    const data = await res.json();

    // Server indicator
    const dot    = document.getElementById('serverDot');
    const label  = document.getElementById('serverStatus');
    if (data.status === 'ok') {
      dot.style.background = 'var(--green)';
      dot.style.boxShadow  = '0 0 8px var(--green)';
      label.textContent    = 'Server Online';
      label.style.color    = 'var(--green)';
    } else {
      dot.style.background = 'var(--red)';
      label.textContent    = 'Server Error';
    }

    // Stats
    const s = data.stats || {};
    animateNum(document.getElementById('asc-gpu-num'),     s.products   || 0);
    animateNum(document.getElementById('asc-price-num'),   s.prices     || 0);
    document.getElementById('asc-uptime-num').textContent = formatUptime(data.uptime || 0);

    // Scheduler
    const sched = data.scheduler || {};
    renderSchedulerStatus(sched);

  } catch (err) {
    const dot   = document.getElementById('serverDot');
    const label = document.getElementById('serverStatus');
    dot.style.background = 'var(--red)';
    label.textContent    = 'ไม่สามารถเชื่อมต่อ';
    label.style.color    = 'var(--red)';
    console.error('Status error:', err);
  }
}

function renderSchedulerStatus(sched) {
  const dotEl   = document.getElementById('schedulerDot');
  const labelEl = document.getElementById('schedulerLabel');

  if (sched.isRunning) {
    dotEl.querySelector('.dot').style.background = 'var(--orange)';
    dotEl.querySelector('.dot').style.boxShadow  = '0 0 8px var(--orange)';
    labelEl.textContent = 'กำลังทำงาน...';
  } else {
    dotEl.querySelector('.dot').style.background = 'var(--text-muted)';
    dotEl.querySelector('.dot').style.boxShadow  = 'none';
    labelEl.textContent = 'รอรอบถัดไป';
  }

  document.getElementById('sched-lastRun').textContent     = timeAgo(sched.lastRun);
  document.getElementById('sched-lastSuccess').textContent = timeAgo(sched.lastSuccess);
  document.getElementById('sched-lastError').textContent   = timeAgo(sched.lastError) ;
  document.getElementById('sched-total').textContent       = sched.totalRuns || '0';
  document.getElementById('sched-running').textContent     = sched.isRunning ? '🟡 กำลังรัน' : '⚪ Idle';
}

// ══════════════════════════════════════════════════
// Load Admin Stats
// ══════════════════════════════════════════════════

async function loadAdminStats() {
  try {
    const res  = await fetch(`${API}/admin/stats`);
    const data = await res.json();
    if (!data.success) return;

    const d = data.data;
    animateNum(document.getElementById('asc-history-num'), d.historyCount || 0);
  } catch (err) {
    console.error('Admin stats error:', err);
  }
}

// ══════════════════════════════════════════════════
// Load Store Status
// ══════════════════════════════════════════════════

async function loadStoreStatus() {
  try {
    const res  = await fetch(`${API}/admin/logs`);
    const data = await res.json();
    if (!data.success) return;

    const { storeStatus } = data;
    const grid = document.getElementById('storesStatusGrid');

    grid.innerHTML = storeStatus.map(store => {
      const sc        = getStoreStyle(store.name);
      const status    = store.last_status || 'never';
      const badgeText = { success:'✅ สำเร็จ', error:'❌ Error', skipped:'⏭️ Skipped', never:'— ยังไม่เคยรัน' };
      const badgeCls  = status === 'success' ? 'success' : status === 'error' ? 'error' : status === 'skipped' ? 'skipped' : 'never';

      return `
        <div class="store-status-card">
          <div class="ss-header">
            <span class="store-logo-pill ss-logo" style="background:${sc.bg};color:${sc.color};">
              ${store.name}
            </span>
            <span class="ss-badge ${badgeCls}">${badgeText[status] || status}</span>
          </div>
          <div class="ss-status-row">
            <span class="ss-key">รันล่าสุด</span>
            <span class="ss-val">${timeAgo(store.last_run)}</span>
          </div>
          <div class="ss-status-row">
            <span class="ss-key">สินค้าที่บันทึก</span>
            <span class="ss-val">${store.items_found != null ? store.items_found : '—'}</span>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    console.error('Store status error:', err);
  }
}

// ══════════════════════════════════════════════════
// Load Scraper Logs
// ══════════════════════════════════════════════════

async function loadLogs() {
  const filter = document.getElementById('logFilter')?.value || '';
  const url    = `${API}/admin/logs?limit=50${filter ? `&status=${filter}` : ''}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('logTableBody');
    const logs  = data.logs || [];

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);">ยังไม่มี Scraper Logs</td></tr>`;
      return;
    }

    const badgeMap = {
      success: ['✅', 'success'],
      error:   ['❌', 'error'],
      skipped: ['⏭️', 'skipped'],
    };

    tbody.innerHTML = logs.map(log => {
      const sc       = getStoreStyle(log.store_name);
      const [ico, cls] = badgeMap[log.status] || ['ℹ️', ''];

      return `
        <tr>
          <td class="td-time">${formatDatetime(log.created_at)}</td>
          <td>
            <span class="store-pill-sm" style="background:${sc.bg};color:${sc.color};">
              ${log.store_name}
            </span>
          </td>
          <td>
            <span class="log-badge ${cls}">${ico} ${log.status}</span>
          </td>
          <td class="td-count">${log.items_found ?? '—'}</td>
          <td class="td-msg">${log.message || '—'}</td>
        </tr>`;
    }).join('');

  } catch (err) {
    console.error('Logs error:', err);
  }
}

// ══════════════════════════════════════════════════
// Load Price Data Table
// ══════════════════════════════════════════════════

async function loadPriceTable() {
  try {
    const res  = await fetch(`${API}/admin/prices`);
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('priceTableBody');
    const prices = data.data || [];

    document.getElementById('priceTableInfo').textContent =
      `${prices.length} รายการ`;

    if (!prices.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">ยังไม่มีข้อมูลราคา</td></tr>`;
      return;
    }

    tbody.innerHTML = prices.map(p => {
      const sc      = getStoreStyle(p.store_name);
      const availCls= p.availability === 'available' ? 'available' : p.availability === 'unavailable' ? 'unavailable' : 'unknown';
      const availTxt= p.availability === 'available' ? '✅ มีสินค้า' : p.availability === 'unavailable' ? '❌ ไม่มีสินค้า' : '❓ ไม่ทราบ';

      return `
        <tr>
          <td><span class="badge badge-primary">${p.gpu_model}</span></td>
          <td style="max-width:220px;font-size:.82rem;">${p.name}</td>
          <td>
            <span class="store-pill-sm" style="background:${sc.bg};color:${sc.color};">
              ${p.store_name}
            </span>
          </td>
          <td style="font-family:var(--font-display);font-weight:700;color:var(--green);">
            ${formatPrice(p.price)}
          </td>
          <td><span class="avail-badge ${availCls}">${availTxt}</span></td>
          <td class="td-time">${timeAgo(p.updated_at)}</td>
        </tr>`;
    }).join('');

  } catch (err) {
    console.error('Price table error:', err);
  }
}

// ══════════════════════════════════════════════════
// Manual Scrape Trigger
// ══════════════════════════════════════════════════

const scrapeActive = new Set(); // ป้องกันกดซ้ำ

async function triggerScrape(store) {
  if (scrapeActive.has(store)) {
    showToast(`${store} กำลังทำงานอยู่`, 'warning');
    return;
  }

  const btnId   = store === 'all' ? 'scrape-all' : `scrape-${store}`;
  const statusId= `ss-${store}`;
  const btn     = document.getElementById(btnId);
  const statusEl= document.getElementById(statusId);

  scrapeActive.add(store);
  if (btn)      { btn.disabled = true; btn.classList.add('running'); }
  if (statusEl) { statusEl.textContent = '⏳ กำลังรัน...'; }
  showToast(`🕷️ เริ่มดึงข้อมูล: ${store}`, 'info');

  try {
    const res  = await fetch(`${API}/admin/scrape`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ store }),
    });
    const data = await res.json();

    if (data.success) {
      showToast(`✅ ${data.message}`, 'success');
      if (statusEl) statusEl.textContent = '⏳ Running...';

      // รีเฟรช logs หลัง 30 วินาที
      setTimeout(async () => {
        await loadLogs();
        await loadStoreStatus();
        scrapeActive.delete(store);
        if (btn) { btn.disabled = false; btn.classList.remove('running'); btn.classList.add('done'); }
        if (statusEl) statusEl.textContent = '✅ Done';
        setTimeout(() => {
          if (btn) btn.classList.remove('done');
          if (statusEl) statusEl.textContent = 'Ready';
        }, 5000);
      }, 30000);
    } else {
      throw new Error(data.error);
    }

  } catch (err) {
    showToast(`❌ Error: ${err.message}`, 'error');
    scrapeActive.delete(store);
    if (btn) { btn.disabled = false; btn.classList.remove('running'); btn.classList.add('failed'); }
    if (statusEl) statusEl.textContent = '❌ Failed';
    setTimeout(() => {
      if (btn) btn.classList.remove('failed');
      if (statusEl) statusEl.textContent = 'Ready';
    }, 5000);
  }
}

// ══════════════════════════════════════════════════
// Load All Data
// ══════════════════════════════════════════════════

async function loadAll() {
  document.getElementById('refreshBtn').disabled = true;
  document.getElementById('refreshBtn').textContent = '⏳ Loading...';

  await Promise.allSettled([
    loadStatus(),
    loadAdminStats(),
    loadStoreStatus(),
    loadLogs(),
    loadPriceTable(),
  ]);

  document.getElementById('refreshBtn').disabled = false;
  document.getElementById('refreshBtn').textContent = '🔄 รีเฟรช';
  showToast('อัปเดตข้อมูลแล้ว', 'success');
}

// ══════════════════════════════════════════════════
// Auto-refresh ทุก 30 วินาที
// ══════════════════════════════════════════════════

let refreshCountdown = 30;
const badge = document.getElementById('autoRefreshBadge');

setInterval(() => {
  refreshCountdown--;
  if (badge) badge.textContent = `🔄 รีเฟรชใน ${refreshCountdown}s`;
  if (refreshCountdown <= 0) {
    refreshCountdown = 30;
    loadStatus();
    loadLogs();
    loadStoreStatus();
  }
}, 1000);

// ══════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
});
