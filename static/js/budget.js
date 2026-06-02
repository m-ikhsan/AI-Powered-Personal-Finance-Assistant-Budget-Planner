/* FinAI – budget.js */

// Budget categories used in the planner
const CATEGORIES = [
  'Food & Drinks','Transportation','Housing',
  'Bills & Utilities','Healthcare','Entertainment',
  'Clothing','Education','Savings / Investment','Other'
];

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize income and budget data
  loadIncomeState();
  // Restore cached AI analysis
  const cached = await aiCacheGet('budget_ai');
  if (cached) {
    document.getElementById('aiCard').style.display = '';
    renderBudgetAI(document.getElementById('aiAdviceBox'), cached);
  }
});

// Load income status on page startup
async function loadIncomeState() {
  const res = await getJSON('/api/income/get').catch(() => ({ has_income: false }));
  if (res.has_income) {
    setIncomeDisplay(res.income);
    showBudgetSection();
    loadBudgetSummary();
  } else {
    document.getElementById('noIncomeGuard').classList.remove('hidden');
  }
}

// Save monthly income
async function saveIncome() {
  const val = parseFloat(document.getElementById('incomeInput').value);
  if (!val || val <= 0) {
    showToast('Please enter a valid income amount!', 'error'); return;}

  const res = await postJSON('/api/income/save', { income: val }).catch(() => null);
  if (!res?.success) { showToast('Failed to save income!', 'error'); return;}

  // Use accumulated income returned by server
  setIncomeDisplay(res.income);
  document.getElementById('incomeInput').value = '';
  showToast(`Income +${formatRp(val)} added. Total: ${formatRp(res.income)}`);
  showBudgetSection();
  loadBudgetSummary();
}

// Update income information in UI
function setIncomeDisplay(income) {
  document.getElementById('incomeSavedBadge').classList.remove('hidden');
  const info = document.getElementById('incomeSavedInfo');
  info.classList.remove('hidden');
  info.innerHTML = `<span style="color:var(--teal);font-weight:700;">
    ✓ Total income: ${formatRp(income)}/month</span>
    — used as the Budget Planner reference.`;
  const disp = document.getElementById('activeIncomeDisplay');
  if (disp) disp.textContent = formatRp(income);
}

// Unlock budget planner after income is available
function showBudgetSection() {
  document.getElementById('noIncomeGuard').classList.add('hidden');
  document.getElementById('budgetPlannerSection').classList.remove('hidden');
}

// Focus income field from guard section
function focusIncomeInput() {
  const el = document.getElementById('incomeInput');
  el.focus();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Generate category dropdown options
function makeCategoryOptions(selected = '') {
  return CATEGORIES.map(c =>
    `<option${c === selected ? ' selected' : ''}>${c}</option>`
  ).join('');
}

// Add a new budget allocation row
function addBudgetRow(cat = '', amt = '') {
  const row = document.createElement('div');
  row.className = 'budget-row';
  row.style.cssText = 'display:flex;gap:10px;margin-bottom:10px;align-items:center;';
  row.innerHTML = `
    <select class="form-control bgt-category" style="flex:1.2;">${makeCategoryOptions(cat)}</select>
    <input type="number" class="form-control bgt-amount" placeholder="Rp 0" min="0"
           style="flex:1;" value="${amt}" oninput="updateMiniTotal()">
    <button class="btn btn-secondary btn-sm" style="padding:8px 10px;flex-shrink:0;"
            onclick="this.parentElement.remove();updateMiniTotal();">✕</button>`;
  document.getElementById('budgetFields').appendChild(row);
}

// Remove the last budget row
function removeBudgetRow() {
  const rows = document.querySelectorAll('#budgetFields .budget-row');
  if (rows.length > 1) { rows[rows.length - 1].remove(); updateMiniTotal(); }
}

// Recalculate allocated budget and remaining income
function updateMiniTotal() {
  const total = [...document.querySelectorAll('.bgt-amount')]
    .reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
  const income = parseFloat(document.getElementById('activeIncomeDisplay')
      ?.textContent.replace(/\D/g, '')) || 0;
  const sisa = income - total;
  document.getElementById('miniTotal').textContent = formatRp(total);
  const sisaEl = document.getElementById('miniSisa');
  sisaEl.textContent = income > 0 ? formatRp(remaining) : '–';
  sisaEl.style.color = remaining >= 0 ? 'var(--teal)' : 'var(--pink)';
}

// Save Budget
async function saveBudget() {

  // Collect budget items from the current form
  const cats  = [...document.querySelectorAll('.bgt-category')];
  const amts  = [...document.querySelectorAll('.bgt-amount')];
  const items = {};
  cats.forEach((c, i) => {
    const a = parseFloat(amts[i].value);
     if (a > 0) items[c.value] = (items[c.value] || 0) + a;
  });

  // Require at least one budget category
  if (!Object.keys(items).length) { showToast('Please fill in at least one category!', 'error'); return; }

  // Server merges with existing budget data
  const res = await postJSON('/api/budget/save', { items }).catch(() => null);
  if (res?.success) {
    showToast('Budget saved! ✓');
    // Refresh summary using latest server data
    loadBudgetSummary();
  } else {
    showToast(res?.error || 'Failed to save budget!', 'error');
  }
}

// Load Budget Summary
async function loadBudgetSummary() {
  const box = document.getElementById('budgetSummaryBox');
  // Show loading state
  box.innerHTML = `<div class="loading-pulse"><div class="dot-loader"><span></span><span></span><span></span></div>Loading...</div>`;

  const data = await getJSON('/api/budget/get').catch(() => null);
  if (!data) { box.innerHTML = `<p class="text-pink">Failed to load data.</p>`; return; }

  // Sync income display with latest server value
  if (data.income) setIncomeDisplay(data.income);
  

  // Handle empty budget state
  if (!data.has_budget) {

    box.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div>
        <p>Budget has not been set yet. Fill out the form and click<strong>Save Budget</strong>.</p>
      </div>`;

    if (!document.querySelector('.budget-row')) addBudgetRow();
    return;
  }

  const items  = data.budget_items || {};
  const income = data.income || 0;

  // Render category summaries
  const rows = Object.entries(items)
    .sort((a, b) => b[1].limit - a[1].limit)
    .map(([cat, v]) => {
      const { limit = 0, terpakai = 0, pct = 0} = v;
      const color = pct >= 100 ? 'var(--pink)' : pct >= 80  ? 'var(--amber)' : 'var(--teal)';
      const barBg = pct >= 100 ? 'linear-gradient(90deg,#FF6584,#ff4466)'
          : pct >= 80 ? 'linear-gradient(90deg,#FFB347,#f59e0b)'
          : 'linear-gradient(90deg,var(--teal),#30c491)';
      return `
        <div class="budget-item-row">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;flex-wrap:wrap;gap:4px;">
            <span style="font-size:.88rem;font-weight:600;">${cat}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:.82rem;">
                <strong>${formatRp(terpakai)}</strong>
                <span style="color:var(--text-muted);"> / ${formatRp(limit)}
                </span>
              </span>
              <span style="background:${pct>100?'rgba(255,101,132,.15)':pct===100?'rgba(67,217,173,.15)':pct>=80?'rgba(255,179,71,.15)':'rgba(67,217,173,.15)'};
                color:${color};
                border:1px solid ${color};border-radius:99px;padding:2px 9px;font-size:.72rem;font-weight:700;">
                ${pct>100?'🔴':pct===100?'🟢':pct>=80?'🟡':'🟢'} ${pct.toFixed(0)}%
              </span>
            </div>
          </div>
          <div class="budget-bar-wrap">
            <div class="budget-bar" style="width:${Math.min(pct,100).toFixed(1)}%;background:${barBg};">
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-muted);margin-top:4px;">
            <span>Used: ${pct.toFixed(1)}%</span>
            <span style="color:${terpakai>limit?'var(--pink)':'inherit'};">
              ${terpakai > limit + 0.01 ? '⚠️ Exceeded by ' + formatRp(terpakai - limit) : 'Remaining ' + formatRp(limit - terpakai)}
            </span>
          </div>
        </div>`;
    }).join('');

    // Calculate overall budget status
  const sisa      = data.total_terpakai - data.total_budget;
  const sisaColor = sisa <= 0 ? 'var(--teal)' : 'var(--pink)';
  const barPct = data.total_budget > 0
    ? Math.min(data.total_terpakai / data.total_budget * 100, 100) : 0;
  const barBgTotal = data.total_terpakai >= data.total_budget
    ? 'linear-gradient(90deg,#FF6584,#ff4466)'
    : barPct >= 80 ? 'linear-gradient(90deg,#FFB347,#f59e0b)'
    : 'linear-gradient(90deg,var(--teal),#30c491)';

  // Render overall summary
  box.innerHTML = `
    ${rows}
    <div class="divider"></div>
    <div>
      <div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:6px;">
        <span style="font-weight:700;">📋 Total</span>
        <span>
          <strong>${formatRp(data.total_terpakai)}</strong>
          <span style="color:var(--text-muted);font-size:.8rem;"> / ${formatRp(data.total_budget)}</span>
        </span>
      </div>

      <div class="budget-bar-wrap">
        <div class="budget-bar" style="width:${barPct.toFixed(1)}%;background:${barBgTotal};"></div>
      </div>

      <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-top:6px;">
        <span style="color:var(--text-muted);">Actual Spending: <strong>${formatRp(data.total_terpakai)}</strong></span>
        <strong style="color:${sisaColor};">${sisa > 0 ? '⚠️ ' : ''}${formatRp(Math.abs(sisa))}</strong>
      </div>
    </div>`;

  if (!document.querySelector('.budget-row')) addBudgetRow();
}

// AI Analysis
async function analyzeWithAI() {
  const aiCard = document.getElementById('aiCard');
  const box    = document.getElementById('aiAdviceBox');
  aiCard.style.display = '';

  // Scroll to AI result section
  aiCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Reuse cached analysis if available
  const cached = await aiCacheGet('budget_ai');
  if (cached) { renderBudgetAI(box, cached); return; }

  // Show loading indicator
  box.innerHTML = `<div class="loading-pulse"><div class="dot-loader">
        <span></span><span></span><span></span></div>Gemini AI is analyzing your budget...</div>`;

  try {
    // Load current budget data
    const data = await getJSON('/api/budget/get');
    if (!data?.has_budget) {
      box.innerHTML = `<p class="text-amber">⚠️ Save your budget before running AI analysis.</p>`; return;
    }
    // Request AI recommendations
    const res = await postJSON('/api/budget/ai-analyze', {
      income: data.income, budget_items: data.budget_items,
      total_budget: data.total_budget, remaining: data.remaining,
    });
    if (res?.advice) {
      await aiCacheSet('budget_ai', res.advice);
      renderBudgetAI(box, res.advice);
      showToast('AI analysis completed!');
    } else {
      box.innerHTML = `<p class="text-pink">Error: ${res?.error || 'Invalid response.'}</p>`;
    }
  } catch(err) {
    // Handle API or server errors
    box.innerHTML = `<p class="text-pink">Failed: ${err.message}. Check your API key in .env</p>`;
  }
}
// Render AI output
function renderBudgetAI(box, advice) {
  box.innerHTML = `<div class="ai-output-header">✨ Gemini AI Analysis</div>
    <div class="ai-output" style="white-space:pre-wrap;">${advice}</div>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;"
            onclick="aiCacheDel('budget_ai').then(()=>analyzeWithAI())">🔄 Refresh</button>`;
}

// Hide AI panel
function closeAiCard() {
  document.getElementById('aiCard').style.display = 'none';
}
