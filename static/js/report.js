/* FinAI – report.js */

// Chart color palette
const PALETTE = [
  '#6C63FF','#FF6584','#43D9AD','#FFB347',
  '#87CEEB','#DDA0DD','#98FB98','#F0E68C'
];

// Report state
let reportData = null;
let aiInsight  = '';

// Tooltip component
const tip = (() => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:5px 11px;font-size:.8rem;pointer-events:none;display:none;z-index:999;color:var(--text-main);box-shadow:var(--shadow);';
  document.body.appendChild(el);
  return el;
})();

// Tooltip helpers
const showTip = (e,t) => { tip.textContent=t; tip.style.display='block'; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY-28)+'px'; };
const hideTip = () => tip.style.display='none';

// Initialize report page
document.addEventListener('DOMContentLoaded', async () => {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  document.getElementById('selMonth').value = m;
  document.getElementById('selYear').value  = y;

  // Restore cached AI insights before loading report
  const rKey    = `report_ai_${y}_${m}`;
  const rCached = await aiCacheGet(rKey);
  if (rCached) {
    aiInsight = rCached;
    document.getElementById('aiCard').style.display = '';
    renderReportAI(document.getElementById('aiBox'), rCached, rKey);
  }

  // Load monthly report data
  await loadReport(false);
});

async function loadReport(resetAI = true) {
  const month = document.getElementById('selMonth').value;
  const year  = document.getElementById('selYear').value;
  reportData = await getJSON(
    `/api/report/monthly?month=${month}&year=${year}`).catch(() => null);
  if (!reportData) {showToast('Failed to load report!', 'error'); return; }

  // Update summary statistics
  const hasData = reportData.income > 0 || reportData.total_expenses > 0;
  document.getElementById('rIncome').textContent   = hasData ? formatRp(reportData.income) : '–';
  document.getElementById('rExpenses').textContent = hasData ? formatRp(reportData.total_expenses) : '–';
  const netEl = document.getElementById('rNet');
  netEl.textContent  = hasData ? formatRp(reportData.net) : '–';
  netEl.style.color  = reportData.net >= 0 ? 'var(--teal)' : 'var(--pink)';
  const scoreEl = document.getElementById('rScore');
  const hs = reportData.health_score;
  scoreEl.textContent = (hs !== null && hs !== undefined) ? hs+'/100' : '–';
  scoreEl.style.color = (hs>=70)?'var(--teal)':(hs>=40)?'var(--amber)':'var(--pink)';

  // Expense Breakdown Chart
  const cats = reportData.categories || {};
  const expBox = document.getElementById('expBreakdown');
  if (Object.keys(cats).length) {
    const labels = Object.keys(cats), values = Object.values(cats);
    const total  = values.reduce((a,b)=>a+b,0);
    const slices = labels.map((l,i)=>({label:l,value:values[i],pct:values[i]/total*100,color:PALETTE[i%PALETTE.length]}));
    let cum=0; const r=70,cx=90,cy=90,C=2*Math.PI*r;

    // Generate SVG pie chart slices
    const paths = slices.map(s=>{
      const dash=(s.pct/100*C).toFixed(2), offset=(C-cum*C/100).toFixed(2);
      cum+=s.pct;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="28"
        stroke-dasharray="${dash} ${(C-parseFloat(dash)).toFixed(2)}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${cx} ${cy})" style="cursor:pointer;"
        onmouseenter="showTip(event,'${s.label}: ${s.pct.toFixed(1)}% (${formatRp(s.value)})')"
        onmousemove="showTip(event,'${s.label}: ${s.pct.toFixed(1)}% (${formatRp(s.value)})')"
        onmouseleave="hideTip()"/>`;
    }).join('');

    // Generate legend items
    const legend = slices.map(s=>`
      <div style="display:flex;align-items:center;gap:6px;font-size:.78rem;margin-bottom:4px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></div>
        <span style="flex:1;color:var(--text-sub);">${s.label}</span>
        <span style="font-weight:600;">${formatRp(s.value)}</span>
      </div>`).join('');
    expBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
        <svg width="180" height="180" style="flex-shrink:0;">${paths}
          <text x="${cx}" y="${cy+5}" text-anchor="middle" fill="white" font-size="9" font-family="Space Grotesk">${formatRp(total)}</text>
        </svg>
        <div style="flex:1;min-width:120px;">${legend}</div>
      </div>`;
  } else {
    expBox.innerHTML = `<div class="empty-state"><p>No expenses this month.</p></div>`;
  }

    // Saving Goals Progress
  const goals = reportData.goals || [];
  document.getElementById('goalsSection').innerHTML = goals.length ? goals.map(g=>{
    const pct = g.target_amount>0?Math.min(g.current_savings/g.target_amount*100,100):0;
    const barBg = pct>=100?'linear-gradient(90deg,var(--teal),#30c491)':pct>=60?'linear-gradient(90deg,#FFB347,#f59e0b)':'linear-gradient(90deg,#FF6584,#ff4466)';
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-weight:700;">${g.goal_name}</span>
          <span style="color:var(--amber);font-weight:700;">${pct.toFixed(1)}%</span>
        </div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:5px;">
          ${formatRp(g.current_savings)} / ${formatRp(g.target_amount)}
        </div>
        <div class="budget-bar-wrap"><div class="budget-bar" style="width:${pct.toFixed(1)}%;background:${barBg};"></div></div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">
          Need to Save: <strong>${formatRp(g.monthly_needed)}/month</strong>
        </div>
      </div>`;
    }).join('') : `<div class="empty-state"><p>No saving goals available.</p></div>`;

  // Budget vs Actual Comparison
  const budgetItems = reportData.budget_items || {};
  const budgetBox   = document.getElementById('budgetSection');
  if (Object.keys(budgetItems).length) {
    const expenses = reportData.expenses || [];
    const keys     = Object.keys(budgetItems);

    // Ensure all categories exist for chart rendering
    keys.forEach(k => { if (!budgetItems[k]) budgetItems[k] = 0;});

    // Calculate chart scaling
    const maxVal = Math.max(...keys.map(k => {
      const act = expenses.filter(e => e.category === k).reduce((s, e) => s + e.amount, 0);
      return Math.max(budgetItems[k], act);
    }), 1);
    const H = 100;

    // Generate bar chart
    const bars = keys.map(cat=>{
      const limit = budgetItems[cat];
      const act   = expenses.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0);
      const pct   = limit>0?act/limit*100:0;
      const color = pct>100?'#FF6584':pct===100?'#43D9AD':pct>=80?'#FFB347':'#43D9AD';
      const hL    = (limit/maxVal*H).toFixed(1);
      const hA    = (act/maxVal*H).toFixed(1);
      const short = cat.length>9?cat.slice(0,9)+'…':cat;
      return `
        <div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;">
          <div style="display:flex;align-items:flex-end;gap:3px;height:${H+30}px;padding-top:30px;position:relative;">
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
              <span style="font-size:.58rem;color:var(--text-muted);position:absolute;top:-16px;white-space:nowrap;">${formatRp(limit).replace('Rp ','')}</span>
              <div style="width:12px;height:${hL}px;background:#6C63FF55;border-radius:3px 3px 0 0;cursor:pointer;"
                onmouseenter="showTip(event,'Budget: ${formatRp(limit)}')" onmousemove="showTip(event,'Budget: ${formatRp(limit)}')" onmouseleave="hideTip()"></div>
            </div>
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
              <span style="font-size:.58rem;color:${color};position:absolute;top:-16px;white-space:nowrap;">${formatRp(act).replace('Rp ','')}</span>
              <div style="width:12px;height:${hA}px;background:${color};border-radius:3px 3px 0 0;cursor:pointer;"
                onmouseenter="showTip(event,'Actual: ${formatRp(act)}')" onmousemove="showTip(event,'Actual: ${formatRp(act)}')" onmouseleave="hideTip()"></div>
            </div>
          </div>
          <div style="font-size:.62rem;color:var(--text-muted);margin-top:4px;text-align:center;max-width:46px;overflow:hidden;white-space:nowrap;">${short}</div>
        </div>`;
    }).join('');

    // Generate budget comparison table rows
    const tblRows =keys.map(cat => {
      const limit =budgetItems[cat];
      const act =expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const pct =limit>0?act/limit*100:0;
      const st =pct > 100? '🔴 Over Budget': pct === 100? '✅ On Target': pct >= 80? '🟡 Near Limit': '🟢 Safe';
      return `<tr>
          <td>${cat}</td>
          <td style="font-weight:600;">${formatRp(limit)}</td>
          <td style="font-weight:600;color:${pct > 100? 'var(--pink)': pct === 100? 'var(--teal)': pct >= 80? 'var(--amber)': 'var(--teal)'};">${formatRp(act)}</td>
          <td>${st}</td>
        </tr>`;
    }).join('');

    budgetBox.innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:4px;padding:0 4px;overflow-x:auto;margin-bottom:16px;">${bars}</div>
      <div style="display:flex;gap:12px;font-size:.72rem;color:var(--text-muted);margin-bottom:14px;">
        <span><span style="display:inline-block;width:10px;height:10px;background:#6C63FF55;border-radius:2px;margin-right:3px;"></span>Budget</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#43D9AD;border-radius:2px;margin-right:3px;"></span>Normal</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#FFB347;border-radius:2px;margin-right:3px;"></span>Near Limit</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#FF6584;border-radius:2px;margin-right:3px;"></span>Over Budget</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Budget</th>
              <th>Actual</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${tblRows}</tbody>
        </table></div>`;
  } else {
    budgetBox.innerHTML = `<div class="empty-state"><p>No budget data available.</p></div>`;
  }

  // Restore or reset AI insights
  const rKey    = `report_ai_${year}_${month}`;
  const rCached = await aiCacheGet(rKey);
  if (rCached) {
    aiInsight = rCached;
    document.getElementById('aiCard').style.display = '';
    renderReportAI(document.getElementById('aiBox'), rCached, rKey);
  } else if (resetAI) {
    aiInsight = '';
    document.getElementById('aiCard').style.display = 'none';
  }
}

// Generate AI financial insights
async function genAI() {
  if (!reportData) { showToast('Please view the report first!', 'error'); return; }
  const card = document.getElementById('aiCard');
  const box  = document.getElementById('aiBox');
  card.style.display = '';
  card.scrollIntoView({behavior: 'smooth',block: 'start'});

  const m   = document.getElementById('selMonth').value;
  const y   = document.getElementById('selYear').value;
  const key = `finai_report_ai_${y}_${m}`;
  const cached = await aiCacheGet(key);

  // Use cached result if available
  if (cached) { aiInsight = cached; renderReportAI(box, cached, key); return; }

  box.innerHTML = `<div class="loading-pulse"><div class="dot-loader"><span></span><span></span><span></span></div>Gemini AI is analyzing...</div>`;
  const res = await postJSON('/api/report/ai-insight', reportData).catch(() => null);
  if (res?.insight) {
    aiInsight = res.insight;
    await aiCacheSet(key, res.insight);
    renderReportAI(box, res.insight, key);
    showToast(
      'AI Insights are ready! They will be included in the PDF.');
  } else {
    box.innerHTML = `<p class="text-pink">Failed: ${res?.error || 'Error'}</p>`;
  }
}

// Render AI analysis output
function renderReportAI(box, insight, key) {
  box.innerHTML = `<div class="ai-output">${insight}</div>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;" 
      data-key="${key}" onclick="refreshReportAI(this)">🔄 Refresh</button>`;
}

// Refresh AI insight by clearing cache
async function refreshReportAI(btn) {
  const key = btn.getAttribute('data-key');
  await aiCacheDel(key);
  aiInsight = '';
  genAI();
}

// Download PDF report
function downloadPDF() {
  if (!reportData) { showToast('Please view the report first!', 'error'); return; }
  const m = document.getElementById('selMonth').value;
  const y = document.getElementById('selYear').value;
  const encoded = encodeURIComponent(aiInsight);

  window.open(`/api/report/download?month=${m}&year=${y}&ai_insight=${encoded}`, '_blank');
}
