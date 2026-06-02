/* FinAI – savings.js */

// Selected investment risk level
let selectedRisk2 = 'Low';

// Initialize page data
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved savings plans
  loadPlanSummary();
  // Load all saving goals
  loadGoals();
  // Restore cached investment guidance
  const inv = await aiCacheGet('invest_guidance');
  if (inv) {
    renderInvestBox(document.getElementById('investmentBox'), inv);
  }
});

// Tabs Navigation
function switchTab(tab) {
  ['Savings','Goals','Investment'].forEach(t => {
    document.getElementById('panel'+t).style.display = t.toLowerCase()===tab?'':'none';
    document.getElementById('tab'+t).className = t.toLowerCase()===tab?'btn btn-primary':'btn btn-secondary';
  });

  // Refresh goals when Goals tab is opened
  if (tab === 'goals') loadGoals();
}

// Load Savings Plan Summary
async function loadPlanSummary() {
  const goals = await getJSON('/api/savings/goals').catch(() => []);
  // No active goal selected by default
  renderPlanSummary(goals, null);
}

function renderPlanSummary(goals, activeId) {
  const box = document.getElementById('planSummary');
  if (!goals.length) {
    box.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div>
        <p>Fill out the form and click Save Plan.</p>
      </div>`;
    return;
  }

  // Expand newest goal by default
  const latestId = activeId ?? goals[goals.length - 1].id;

  box.innerHTML = goals.map(g => {
    const pct = g.target_amount > 0 ? Math.min(g.current_savings / g.target_amount * 100, 100) : 0;
    const color  = pct>=100?'var(--teal)':pct>=60?'var(--amber)':'var(--pink)';
    const barBg  = pct>=100?'linear-gradient(90deg,var(--teal),#30c491)'
                 : pct>=60 ?'linear-gradient(90deg,#FFB347,#f59e0b)'
                 :           'linear-gradient(90deg,#FF6584,#ff4466)';
    const isOpen = g.id === latestId;

    const detail = `
      <div style="margin-top:10px;">
        <div class="budget-bar-wrap" style="margin-bottom:5px;">
          <div class="budget-bar" style="width:${pct.toFixed(1)}%;background:${barBg};"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.78rem;
                    color:var(--text-muted);margin-bottom:10px;">
          <span>Saved: <strong style="color:var(--text-main);">${formatRp(g.current_savings)}</strong></span>
          <span>Target: <strong style="color:var(--text-main);">${formatRp(g.target_amount)}</strong></span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="background:var(--bg-input);border-radius:8px;padding:10px;text-align:center;">
            <div class="text-muted" style="font-size:.72rem;margin-bottom:3px;">REMAINING</div>
            <div style="font-weight:700;color:var(--pink);">${formatRp(g.target_amount-g.current_savings)}</div>
          </div>
          <div style="background:var(--bg-input);border-radius:8px;padding:10px;text-align:center;">
            <div class="text-muted" style="font-size:.72rem;margin-bottom:3px;">NEEDED / MONTH</div>
            <div style="font-weight:700;color:var(--teal);">${formatRp(g.monthly_needed)}</div>
          </div>
        </div>
      </div>`;

    return `
    <div style="background:var(--bg-card2);border:1px solid var(--border);
                border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  cursor:pointer;" onclick="toggleSummaryItem(${g.id})">
        <div>
          <div style="font-weight:700;font-size:.9rem;">${g.goal_name}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">
            ${g.timeline_months} months · ${formatRp(g.monthly_needed)}/month
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:700;color:${color};">${pct.toFixed(1)}%</span>
          <span id="arrow_${g.id}" style="color:var(--text-muted);font-size:.8rem;">${isOpen ? '▲' : '▼'}</span>
        </div>
      </div>
      <div id="detail_${g.id}" style="display:${isOpen ? 'block' : 'none'};">${detail}</div>
    </div>`;
  }).join('');
}

// Expand / collapse goal details
function toggleSummaryItem(id) {
  const el    = document.getElementById(`detail_${id}`);
  const arrow = document.getElementById(`arrow_${id}`);
  const open  = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  arrow.textContent = open ? '▲' : '▼';
}

// Save Savings Plan
async function savePlan() {
  const goalName = document.getElementById('goalName').value.trim();
  const target   = parseFloat(document.getElementById('targetAmount').value);
  const current  = parseFloat(document.getElementById('currentSavings').value)||0;
  const months   = parseInt(document.getElementById('timelineMonths').value);
  const income   = parseFloat(document.getElementById('monthlyIncome').value)||0;

  if (!goalName || !target || !months) { showToast('Please enter a goal name, target amount, and timeline!','error'); return; }

  const res = await postJSON('/api/savings/plan',{
    goal_name:goalName, target_amount:target,
    current_savings:current, timeline_months:months, monthly_income:income
  }).catch(()=>null);

  if (!res?.success) { showToast('Failed to save plan!', 'error'); return; }

  // Refresh summary and expand newly created goal
  const goals = await getJSON('/api/savings/goals').catch(() => []);
  renderPlanSummary(goals, res.goal.id);
  showToast('Plan saved successfully!');
  loadGoals();
}

// Goals CRUD
async function loadGoals() {
  const box = document.getElementById('goalsList');
  if (!box) return;
  // Show loading state
  box.innerHTML = loading('Loading goals...');
  const goals = await getJSON('/api/savings/goals').catch(() => []);
  if (!goals.length) {
    box.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>
      <p>No goals available. Create one in the<strong>Savings Plan</strong>tab.</p></div>`;
    return;
  }

  // Render all goals
   box.innerHTML = goals.map(g => {
    const pct   = g.target_amount>0?Math.min(g.current_savings/g.target_amount*100,100):0;
    const color = pct>=100?'var(--teal)':pct>=60?'var(--amber)':'var(--pink)';
    const barBg = pct>=100?'linear-gradient(90deg,var(--teal),#30c491)'
                : pct>=60 ?'linear-gradient(90deg,#FFB347,#f59e0b)'
                :           'linear-gradient(90deg,#FF6584,#ff4466)';
    return `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:1rem;">${g.goal_name}</div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">
            ${g.timeline_months} months · Need: ${formatRp(g.monthly_needed)}/month
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="openEdit(${g.id})">✏️</button>
          <button class="btn btn-pink btn-sm" onclick="deleteGoal(${g.id})">🗑</button>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:5px;">
        <span class="text-sub">Progress</span>
        <span style="font-weight:700;color:${color};">${pct.toFixed(1)}%</span>
      </div>
      <div class="budget-bar-wrap">
        <div class="budget-bar" style="width:${pct.toFixed(1)}%;background:${barBg};"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.78rem;
                  color:var(--text-muted);margin-top:4px;margin-bottom:12px;">
        <span>Saved: <strong style="color:var(--text-main);">${formatRp(g.current_savings)}</strong></span>
        <span>Target: <strong style="color:var(--text-main);">${formatRp(g.target_amount)}</strong></span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <input type="number" class="form-control" id="dep_${g.id}"
               placeholder="Amount (Rp)" min="0" style="flex:1;font-size:.85rem;">
        <button class="btn btn-teal btn-sm" onclick="depositGoal(${g.id})"> + Add</button>
        <button class="btn btn-secondary btn-sm" onclick="depositGoal(${g.id},true)"> − Withdraw</button>
      </div>
      <button class="btn btn-secondary btn-sm btn-block" onclick="goalAI(${g.id})">
        🤖 AI Analysis for This Goal
      </button>
      <div id="ai_${g.id}" style="margin-top:10px;display:none;"></div>
      ${
        pct >= 100 ? '<div style="text-align:center;margin-top:10px;color:var(--teal);font-weight:700;">🎉 Goal Achieved!</div>':''}
    </div>`;
  }).join('');

  // Restore cached AI results
goals.forEach(g => {
    aiCacheGet(`goal_${g.id}`).then(v => {
      if (!v) return;
      const box2 = document.getElementById(`ai_${g.id}`);
      if (box2) { box2.style.display=''; renderGoalAI(box2, g.id, v); }
    });
  });
}

// Add or withdraw savings from a goal
async function depositGoal(id, minus = false) {
  const input = document.getElementById(`dep_${id}`);
  const amount = parseFloat(input.value);
  if (!amount || amount <= 0) { showToast('Please enter an amount!', 'error'); return; }
  const res = await postJSON(`/api/savings/goals/${id}/deposit`, {amount: minus ? -amount : amount}).catch(() => null);
  if (res?.success) {
    showToast(minus? 'Amount deducted ✓': 'Amount added ✓');
    input.value = '';
    loadGoals();

    // Sync summary in Savings Plan tab
    const goals = await getJSON('/api/savings/goals').catch(() => []);
    renderPlanSummary(goals, null);
  } else { showToast('Failed!', 'error');
  }
}

// Generate AI advice for a specific goal
async function goalAI(id) {
  const box = document.getElementById(`ai_${id}`);
  const key = `goal_${id}`;
  box.style.display = '';
  const cached = await aiCacheGet(key);
  if (cached) { renderGoalAI(box, id, cached); return; }
  box.innerHTML = loading('Gemini AI is analyzing...');
  const res = await getJSON(`/api/savings/goals/${id}/ai`).catch(() => null);
  if (res?.advice) { await aiCacheSet(key, res.advice); renderGoalAI(box, id, res.advice); } 
      else { box.innerHTML = `<p class="text-pink">Failed: ${res?.error || 'Error'}</p>`;
  }
}

// Render AI advice box
function renderGoalAI(box, id, advice) {
  box.innerHTML = `<div class="ai-output-header" style="margin-top:4px;">✨ AI Analysis</div>
    <div class="ai-output">${advice}</div>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;"
      data-id="${id}" onclick="refreshGoalAI(this)">🔄 Refresh</button>`;
}

// Refresh AI analysis
async function refreshGoalAI(btn) {
  const id = btn.getAttribute('data-id');
  await aiCacheDel('goal_' + id);
  goalAI(parseInt(id));
}

// Open edit modal and populate goal data
function openEdit(id) {
  getJSON('/api/savings/goals').then(goals => {
    const g = goals.find(x=>x.id===id); if(!g) return;
    document.getElementById('editId').value     = id;
    document.getElementById('editName').value   = g.goal_name;
    document.getElementById('editTarget').value = g.target_amount;
    document.getElementById('editMonths').value = g.timeline_months;
    document.getElementById('editModal').style.display='flex';
  });
}

// Submit goal updates
async function submitEdit() {
  const id  = parseInt(document.getElementById('editId').value);
  const res = await fetch(`/api/savings/goals/${id}`,{
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      goal_name:       document.getElementById('editName').value,
      target_amount:   parseFloat(document.getElementById('editTarget').value),
      timeline_months: parseInt(document.getElementById('editMonths').value),
    })
  }).then(r=>r.json()).catch(()=>null);
  if (res?.success) { showToast('Goal updated ✓'); closeModal(); loadGoals(); } 
  else {showToast('Failed!', 'error');}
}

// Delete a goal
async function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  const res = await fetch(`/api/savings/goals/${id}`,{ method:'DELETE' }).then(r=>r.json()).catch(()=>null);
  if (res?.success) {
    showToast('Goal deleted', 'warn');
    loadGoals();
    const goals = await getJSON('/api/savings/goals').catch(()=>[]);
    renderPlanSummary(goals, null);
  }
}

// Close edit modal
function closeModal() { document.getElementById('editModal').style.display='none'; }

// ── Investment Guidance ─────────────────────────────────────────────────────

// Select investment risk level
function selectRisk2(level) {
  selectedRisk2 = level;
  [['riskLow2','Low'],['riskMedium2','Medium'],['riskHigh2','High']].forEach(([id,lv]) => {
    document.getElementById(id).className = 'risk-btn' + ( lv===level ? ` selected-${lv==='Low'?'low':lv==='Medium'?'medium':'high'}` : '');
  });
}

// Generate AI investment guidance
async function getInvestmentGuidance() {
  const amount=parseFloat(document.getElementById('investAmount').value);
  const horizon=document.getElementById('investHorizon').value;
  if (!amount || amount <= 0) { showToast('Please enter an investment amount!','error'); return; }
  const box= document.getElementById('investmentBox');
  box.innerHTML=loading('AI is analyzing...');
  try {
    const res = await postJSON('/api/savings/investment',{amount,horizon,risk_level: selectedRisk2});
    await aiCacheSet('invest_guidance', res.guidance);
    renderInvestBox(box, res.guidance);
  } catch(err) { box.innerHTML = `<p class="text-pink">Error: ${err.message}</p>`; }
}

// Render investment guidance result
function renderInvestBox(box, guidance) {
  box.innerHTML = `<div class="ai-output-header">✨ Gemini AI Guidance</div>
    <div class="ai-output">${guidance}</div>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;"
      onclick="aiCacheDel('invest_guidance');this.parentElement.innerHTML=''">🔄 Clear</button>`;
}

// Loading animation helper
function loading(msg) {
  return `<div class="loading-pulse"><div class="dot-loader"><span></span><span></span><span></span></div>${msg}</div>`;
}
