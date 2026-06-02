/* 
   FinAI – expense.js
   Expense Analyzer Page Logic
*/

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {

  // Set default date to today
  const dateEl = document.getElementById('expDate');
  if (dateEl) dateEl.valueAsDate = new Date();

  // Configure drag & drop upload area
  const zone = document.getElementById('uploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleCSVUpload(e.dataTransfer.files[0]);
    });
  }

  // Load existing expenses
  loadExpenses();

  // Restore cached AI insights
  await restoreExpenseAI();
});

// Add Expense
async function addExpense() {
  const amount = parseFloat(document.getElementById('expAmount').value);
  if (!amount || amount <= 0) {
    showToast('Please enter an expense amount!', 'error');
    return;
  }

  await postJSON('/api/expense/add', {
    date:        document.getElementById('expDate').value,
    category:    document.getElementById('expCategory').value,
    description: document.getElementById('expDesc').value,
    amount,
  });

  // Reset form fields
  document.getElementById('expAmount').value = '';
  document.getElementById('expDesc').value   = '';
  showToast('Transaction added ✓');
  loadExpenses();
}

// CSV Upload
function triggerFileInput() {
  document.getElementById('csvFile').click();
}

function onFileSelected(input) {
  const file = input.files[0];
  if (file) {handleCSVUpload(file);}
}

// Upload and import CSV data
async function handleCSVUpload(file) {
  const status = document.getElementById('uploadStatus');
  status.innerHTML = loadingHTML('Uploading...');
  const form = new FormData();
  form.append('file', file);

  try {

    const res  = await fetch('/api/expense/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (data.success) {
      status.innerHTML = `<p class="text-teal" style="margin-top:8px;">✅ Successfully imported ${data.imported} transactions.</p>`;
      showToast(`${data.imported} transactions imported successfully!`);
      loadExpenses();
    } else {
      status.innerHTML = `<p class="text-pink" style="margin-top:8px;">❌ ${data.error}</p>`;
    }

  } catch (err) {
    status.innerHTML = `<p class="text-pink" style="margin-top:8px;">❌ Upload failed.</p>`;
  }
}

// Load Expense Table
async function loadExpenses() {
  const expenses = await getJSON('/api/expense/list');
  const tbody   = document.getElementById('expenseTable');
  const countEl = document.getElementById('expCount');

  // Update transaction counter
  if (countEl) countEl.textContent = `${expenses.length} transactions`;

  // Empty state
  if (!expenses.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state" style="padding:20px 0;">
            <p>No transactions yet.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  // Render transaction rows
  tbody.innerHTML = [...expenses].reverse().map(e => `
    <tr>
      <td style="color:var(--text-muted);font-size:.82rem;">${e.date}</td>
      <td><span class="badge badge-purple">${e.category}</span>
      </td>
      <td style="color:var(--text-sub);font-size:.85rem;">${e.description || '–'}</td>
      <td style="font-weight:600;">${formatRp(e.amount)}</td>
      <td>
        <button class="btn btn-pink btn-sm" onclick="deleteExpense(${e.id})">🗑</button>
      </td>
    </tr>`).join('');
}

// Delete Expense
async function deleteExpense(id) {

  // Remove a single transaction
  await fetch(`/api/expense/delete/${id}`, { method: 'DELETE' });
  showToast('Transaction deleted', 'warn');
  loadExpenses();
}

// Clear All Expenses
async function clearAllExpenses() {
  // Confirm before deleting all records
  if (!confirm('Delete ALL transactions?')) return;
  await fetch('/api/expense/clear', { method: 'DELETE' });
  showToast('All transactions deleted', 'warn');
  loadExpenses();
  resetOutputBoxes();
}

// Reset AI output and cache
function resetOutputBoxes() {
  document.getElementById('insightBox').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">💡</div>
      <p>Gemini AI insights will appear here.</p>
    </div>`;
  aiCacheDel('expense_insight');
  aiCacheDel('expense_total');
}

// Analyze Expenses
async function analyzeExpenses() {
  const insightBox = document.getElementById('insightBox');

  // Show loading state
  insightBox.innerHTML = loadingHTML('AI is analyzing...');

  try {
    const insightRes = await getJSON('/api/expense/analyze');

    if (insightRes.insights) {
      renderExpenseInsight(insightRes.insights, insightRes.total);

      // Cache AI result locally
      await aiCacheSet('expense_insight',insightRes.insights);
      await aiCacheSet('expense_total', String(insightRes.total));
    }

    showToast('Analysis completed!');
  } catch (err) {
    insightBox.innerHTML = `<p class="text-pink">Error: ${err.message}</p>`;
    showToast('Analysis failed!', 'error');
  }
}

// Render AI Insight
function renderExpenseInsight(text, total) {
  document.getElementById('insightBox').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div class="ai-output-header" style="margin:0;">✨ Gemini AI Insights</div>
      <span style="font-size:.82rem;color:var(--text-muted);">Total: <strong style="color:var(--pink)">${formatRp(total)}</strong></span>
    </div>
    <div class="ai-output">${text}</div>`;
}

// Restore cached AI insight
async function restoreExpenseAI() {
  const [insight, total] = await Promise.all([
    aiCacheGet('expense_insight'),
    aiCacheGet('expense_total'),
  ]);

  if (insight) renderExpenseInsight(insight,parseFloat(total) || 0);
}

// Utility Helpers
function loadingHTML(msg) {
  return `<div class="loading-pulse">
      <div class="dot-loader"><span></span><span></span><span></span></div>
      ${msg}
    </div>`;
}
