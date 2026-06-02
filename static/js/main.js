/*
   FinAI – main.js
   Shared Utilities Across All Pages
*/

// Sidebar Elements
const sidebar        = document.getElementById('sidebar');
const mobileMenuBtn  = document.getElementById('mobileMenuBtn');
const sidebarToggle  = document.getElementById('sidebarToggle');

// Mobile sidebar toggle
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
}

// Close sidebar when tapping outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 &&
      sidebar && sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      e.target !== mobileMenuBtn) {
    sidebar.classList.remove('open');
  }
});

// Toast Notifications
function showToast(msg, type = 'success', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
  toast.textContent = msg;
  container.appendChild(toast);

  // Auto-remove toast after timeout
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Indonesian Rupiah Formatter
function formatRp(val) {
  return 'Rp ' + Number(val).toLocaleString('id-ID');
}

// Loading Helpers
function showLoading(containerId, msg = 'Memproses...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="loading-pulse">
      <div class="dot-loader">
        <span></span><span></span><span></span>
      </div>
      ${msg}
    </div>`;
  el.classList.remove('hidden');
}

// Remove loading indicator
function clearLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

// POST Request Helper
async function postJSON(url, body) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return res.json();
}

// GET Request Helper
async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

// Auto-format currency input while typing
document.querySelectorAll('input[data-currency]').forEach(input => {
  input.addEventListener('input', () => {
    let raw = input.value.replace(/\D/g, '');
    input.dataset.raw = raw;
    if (raw) input.value = Number(raw).toLocaleString('id-ID');
  });
});

// Extract numeric value from formatted currency input
function getRawValue(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return 0;
  const raw = el.value.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(raw) || 0;
}

// AI Cache Utilities
async function aiCacheGet(key) {
  try {
    const res = await fetch(`/api/ai-cache/${encodeURIComponent(key)}`);
    const data = await res.json();
    return data.result || '';
  } catch { return ''; }
}

// Save AI result to cache
async function aiCacheSet(key, result) {
  try {
    await fetch(`/api/ai-cache/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result }),
    });
  } catch {}
}

// Delete cached AI result
async function aiCacheDel(key) {
  try {
    await fetch(`/api/ai-cache/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {}
}