from flask import Flask, render_template, request, jsonify, send_file
import google.generativeai as genai
import json, os, csv, io, base64
from datetime import datetime
from datetime import timedelta
from dotenv import load_dotenv

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER

# ── Application Setup ──────────────────────────────────────────────────────────────────────
load_dotenv()
app = Flask(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY_HERE")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

# ── JSON file paths ────────────────────────────────────────────────────────────
BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
BUDGET_FILE       = os.path.join(BASE_DIR, "budget.json")
FINANCE_DATA_FILE = os.path.join(BASE_DIR, "finance_data.json")
GOALS_FILE        = os.path.join(BASE_DIR, "goals.json")

AI_CACHE_FILE = os.path.join(BASE_DIR, "ai_cache.json")

# Chat history remains in memory 
chat_history = []


# ── JSON helpers ───────────────────────────────────────────────────────────────
def read_json(filepath):
    """Read JSON file and return default value if file is empty or invalid."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else _default(filepath)
    except Exception:
        return _default(filepath)

def write_json(filepath, data):
    """Write data to a JSON file with formatted indentation."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _default(filepath):
    """Return default structure based on file name."""
    name = os.path.basename(filepath)
    if name == "budget.json":       return {}
    if name == "finance_data.json": return {"expenses": [], "income": []}
    if name == "goals.json":        return []
    return {}


# ── Template context ───────────────────────────────────────────────────────────
@app.context_processor
def inject_now():
    # Provide current date to all templates
    return {"now": datetime.now().strftime("%A, %d %B %Y")}


# ── Page Routes ────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/budget")
def budget_page():
    return render_template("budget.html")

@app.route("/expense")
def expense_page():
    return render_template("expense.html")

@app.route("/advisor")
def advisor_page():
    return render_template("advisor.html")

@app.route("/savings")
def savings_page():
    return render_template("savings.html")

@app.route("/report")
def report_page():
    return render_template("report.html")


# ══════════════════════════════════════════════════════════════════════════════
# API: INCOME  →  finance_data.json ["income"]  &  budget.json ["income"]
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/income/save", methods=["POST"])
def save_income():
    data       = request.json
    new_income = float(data.get("income", 0))
    if new_income <= 0:
        return jsonify({"error": "Income must be greater than 0"}), 400

    # Add new income to the existing total
    budget       = read_json(BUDGET_FILE)
    total_income = budget.get("income", 0) + new_income
    budget["income"]           = total_income
    budget["income_timestamp"] = datetime.now().isoformat()
    write_json(BUDGET_FILE, budget)

    # Store income transaction history
    finance = read_json(FINANCE_DATA_FILE)
    finance.setdefault("income", []).append(
        {"amount": new_income, "timestamp": datetime.now().isoformat()}
    )
    write_json(FINANCE_DATA_FILE, finance)

    return jsonify({"success": True, "income": total_income})


@app.route("/api/income/get", methods=["GET"])
def get_income():
    budget = read_json(BUDGET_FILE)
    income = budget.get("income", 0)
    return jsonify({"income": income, "has_income": income > 0})


# ══════════════════════════════════════════════════════════════════════════════
# API: BUDGET PLANNER  →  budget.json ["budget_items"]
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/budget/save", methods=["POST"])
def save_budget():
    """Save budget allocations by category. Income is retrieved from budget.json"""
    data  = request.json
    items = data.get("items", {})

    budget = read_json(BUDGET_FILE)
    income = budget.get("income", 0)

    if income <= 0:
        return jsonify({"error": "Income has not been set. Please enter your income first."}), 400

    # Merge new budget values with existing categories
    existing = budget.get("budget_items", {})
    for cat, amt in items.items():
        existing[cat] = existing.get(cat, 0) + float(amt)
    total_budget = sum(float(v) for v in existing.values() if v)
    remaining    = income - total_budget

    budget["budget_items"]     = existing
    budget["total_budget"]     = total_budget
    budget["remaining"]        = remaining
    budget["budget_timestamp"] = datetime.now().isoformat()
    write_json(BUDGET_FILE, budget)

    return jsonify({
        "success":      True,
        "income":       income,
        "total_budget": total_budget,
        "remaining":    remaining,
        "items":        items,
    })


@app.route("/api/budget/get", methods=["GET"])
def get_budget():
    # Load all required data sources
    budget   = read_json(BUDGET_FILE)
    finance  = read_json(FINANCE_DATA_FILE)
    goals    = read_json(GOALS_FILE)
    expenses = finance.get("expenses", [])

    income       = budget.get("income", 0)
    budget_items = budget.get("budget_items", {})

    # Calculate Saving Goal budget limit:
    # - First month (has current_savings): use current_savings
    # - Following months: use monthly_needed
    # Logic: if current_savings > 0 and no previous deposit exists → first month
    now_month = datetime.now().strftime("%Y-%m")
    saving_limit = 0
    for g in goals:
        # Check whether a Saving Goal expense exists this month
        dep_this_month = any(
            e.get("category") == "Saving Goal" and
            e.get("description","").endswith(g["goal_name"]) and
            e.get("date","").startswith(now_month)
            for e in expenses
        )
        # If goal was created this month, use current_savings
        goal_created_month = g.get("timestamp","")[:7]
        if goal_created_month == now_month:
            saving_limit += g.get("current_savings", 0)
        else:
            saving_limit += g.get("monthly_needed", 0)

    # Add Saving Goal as a virtual budget category
    if saving_limit > 0:
        budget_items = {**budget_items, "Saving Goal": saving_limit}

    # Filter actual spending for current month only
    cur_month = datetime.now().strftime("%Y-%m")
    realisasi = {}
    for e in expenses:
        if e.get("date", "").startswith(cur_month):
            cat = e["category"]
            realisasi[cat] = realisasi.get(cat, 0) + e["amount"]

    # Build budget summary per category
    result_items = {}
    all_categories = set(list(budget_items.keys()) + list(realisasi.keys()))
    for cat in all_categories:
        limit    = float(budget_items.get(cat, 0))
        terpakai = realisasi.get(cat, 0)
        pct      = round((terpakai / limit * 100), 1) if limit > 0 else 0
        result_items[cat] = {
            "limit":    limit,
            "terpakai": terpakai,
            "sisa":     limit - terpakai,
            "pct":      round(pct, 1),
        }

    total_budget   = budget.get("total_budget", 0) + saving_limit
    total_terpakai = sum(v["terpakai"] for v in result_items.values())

    return jsonify({
        "has_income":       income > 0,
        "has_budget":       bool(budget_items),
        "income":           income,
        "budget_items":     result_items,
        "total_budget":     total_budget,
        "total_terpakai":   total_terpakai,
        "remaining":        income - total_budget,
        "income_timestamp": budget.get("income_timestamp", ""),
        "budget_timestamp": budget.get("budget_timestamp", ""),
    })


@app.route("/api/budget/ai-analyze", methods=["POST"])
def ai_analyze_budget():
    """Send budget and actual spending data to Gemini for analysis and recommendations."""
    data         = request.json
    income       = float(data.get("income", 0))
    budget_items = data.get("budget_items", {})
    total_budget = float(data.get("total_budget", 0))
    remaining    = float(data.get("remaining", 0))

    detail_lines = []
    over_budget  = []
    # Build category-by-category budget report
    for cat, v in budget_items.items():
        limit    = v.get("limit", 0)
        terpakai = v.get("terpakai", 0)
        pct      = v.get("pct", 0)
        status   = "OVER BUDGET" if pct > 100 else ("NEAR LIMIT" if pct > 80 else "SAFE")
        detail_lines.append(f"  - {cat}: budget Rp {limit:,.0f} | actual Rp {terpakai:,.0f} ({pct:.1f}%) [{status}]")
        if pct > 100:
            over_budget.append(cat)

    detail_str = "\n".join(detail_lines) if detail_lines else "  (no expense data available)"
    over_str   = ", ".join(over_budget) if over_budget else "none"
    # Calculate budget utilization metrics
    sisa_pct   = (remaining / income * 100) if income > 0 else 0
    used_pct   = (total_budget / income * 100) if income > 0 else 0

    # Build AI prompt for budget analysis
    prompt = f"""
You are a personal financial planner who helps users manage their monthly budgets realistically, effectively, and sustainably.

Here is the user's financial data:

Monthly Income:
Rp {income:,.0f}

Total Budget:
Rp {total_budget:,.0f}

Budget-to-Income Ratio:
{used_pct:.1f}%

Unallocated Funds:
Rp {remaining:,.0f} ({sisa_pct:.1f}%)

Categories Over Budget:
{over_str}

Budget and actual spending details:
{detail_str}

Tasks:
1. Evaluate the user's overall financial condition
2. Identify overspending or high-risk categories
3. Recommend a healthier budget allocation
4. Suggest realistic cost-saving strategies
5. Provide the most important priority actions

Use the following format:

Financial Summary
- Brief assessment of the user's financial condition

Spending Analysis
- Evaluate spending patterns by category
- Explain which categories are the largest or least efficient

Budget Warnings
- Mention categories that exceed or are close to exceeding the budget
- Explain their impact on financial stability

Allocation Recommendations
- Provide recommendations based on the 50/30/20 budgeting rule
- Include suggested amounts in Rupiah

Saving Strategies
- Provide 2–3 practical saving strategies
- Include estimated monthly savings potential

Priority Actions
- List the 3 most important actions to take immediately

Requirements:
- Use professional and easy-to-understand English
- All monetary values must be in Rupiah format
- Do not make assumptions beyond the provided data
- Focus on realistic and actionable recommendations
- Maximum 400 words
"""

    try:
        # Generate AI analysis using Gemini
        response = model.generate_content(prompt)
        return jsonify({"advice": response.text})
    except Exception as e:
        # Return error response if generation fails
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════════
# API: EXPENSE ANALYZER  →  finance_data.json ["expenses"]
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/expense/add", methods=["POST"])
def add_expense():
    d       = request.json
    finance = read_json(FINANCE_DATA_FILE)
    # Create a new expense record
    exp = {
        "id":          int(datetime.now().timestamp() * 1000),
        "date":        d.get("date", datetime.now().strftime("%Y-%m-%d")),
        "category":    d.get("category", "Other"),
        "description": d.get("description", ""),
        "amount":      float(d.get("amount", 0)),
        "created_at":  datetime.now().isoformat(),
    }
    finance["expenses"].append(exp)
    write_json(FINANCE_DATA_FILE, finance)
    return jsonify({"success": True, "expense": exp})


@app.route("/api/expense/upload", methods=["POST"])
def upload_expenses():
    if "file" not in request.files:
        return jsonify({"error": "Tidak ada file"}), 400
    stream  = io.StringIO(request.files["file"].stream.read().decode("UTF8"))
    finance = read_json(FINANCE_DATA_FILE)
    count   = 0

    # Import expenses from CSV file
    for row in csv.DictReader(stream):
        try:
            finance["expenses"].append({
                "id":          int(datetime.now().timestamp() * 1000) + count,
                "date":        row.get("date", datetime.now().strftime("%Y-%m-%d")),
                "category":    row.get("category", "Other"),
                "description": row.get("description", ""),
                "amount":      float(row.get("amount", 0)),
                "created_at":  datetime.now().isoformat(),
            })
            count += 1
        except Exception:
            continue
    write_json(FINANCE_DATA_FILE, finance)
    return jsonify({"success": True, "imported": count})


@app.route("/api/expense/list", methods=["GET"])
def list_expenses():
    finance = read_json(FINANCE_DATA_FILE)
    return jsonify(finance.get("expenses", []))


@app.route("/api/expense/delete/<int:eid>", methods=["DELETE"])
def delete_expense(eid):
    finance = read_json(FINANCE_DATA_FILE)
    # Remove selected expense by ID
    finance["expenses"] = [e for e in finance["expenses"] if e["id"] != eid]
    write_json(FINANCE_DATA_FILE, finance)
    return jsonify({"success": True})


@app.route("/api/expense/clear", methods=["DELETE"])
def clear_expenses():
    finance = read_json(FINANCE_DATA_FILE)
    # Clear all expense records
    finance["expenses"] = []
    write_json(FINANCE_DATA_FILE, finance)
    return jsonify({"success": True})


@app.route("/api/expense/analyze", methods=["GET"])
def analyze_expenses():
    finance  = read_json(FINANCE_DATA_FILE)
    expenses = finance.get("expenses", [])
    if not expenses:
        return jsonify({"error": "No expense data available"}), 400

    # Group expenses by category
    categories = {}
    for e in expenses:
        categories[e["category"]] = categories.get(e["category"], 0) + e["amount"]
    total = sum(categories.values())

    # Recent transaction details for AI analysis
    detail_lines = []
    for e in expenses[-30:]:  # max 30 latest transactions
        desc = e.get("description", "").strip()
        detail_lines.append(
            f"  - {e['date']} | {e['category']} | {desc if desc else '(no description)'} | Rp {e['amount']:,.0f}"
        )
    detail_str = "\n".join(detail_lines)

    # Category spending summary
    cat_str = "\n".join(
        f"  {k}: Rp {v:,.0f} ({v/total*100:.1f}%)"
        for k, v in sorted(categories.items(), key=lambda x: -x[1])
    )

    prompt = f"""
You are an experienced personal finance consultant who helps users analyze and optimize their monthly spending based on objective, data-driven insights.

Here is the user's expense data:

Total Expenses:
Rp {total:,.0f}

Category Summary:
{cat_str}

Transaction Details (date | category | description | amount):
{detail_str}

Analyze all expense data above thoroughly, including transaction descriptions, then provide actionable insights and recommendations.

Use the following structure:

1. Spending Patterns
   Evaluate overall spending behavior based on categories and transaction descriptions. Mention specific items or descriptions that reflect spending habits.

2. Transactions That Need Attention
   Highlight 2–3 transactions or recurring spending patterns that appear excessive or inefficient, including their amounts.

3. Expense Classification
   Classify expenses into:

* Essential Needs
* Secondary Needs
* Wasteful Spending

4. Savings Recommendations
   Provide 3 practical recommendations based on the actual transaction descriptions above, including estimated monthly savings in Rp.

Requirements:
- Use professional and easy-to-understand English
- Always refer to actual transaction descriptions
- Do not make assumptions beyond the provided data
- Use Rp format for all currency values
- Maximum 350 words
"""
    try:
        response = model.generate_content(prompt)
        insights = response.text
    except Exception as e:
        insights = f"AI generation failed: {str(e)}"

    return jsonify({
        "categories": categories,
        "total":      total,
        "insights":   insights,
        "count":      len(expenses),
    })

# ══════════════════════════════════════════════════════════════════════════════
# API: AI FINANCIAL ADVISOR  
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/chat", methods=["POST"])
def chat():
    # Get user message
    user_msg = request.json.get("message", "")

    budget   = read_json(BUDGET_FILE)
    finance  = read_json(FINANCE_DATA_FILE)
    goals    = read_json(GOALS_FILE)
    expenses = finance.get("expenses", [])
    income   = budget.get("income", 0)
    today    = datetime.now()

    # Last 30 transactions sorted by date 
    yesterday  = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    today_str  = today.strftime("%Y-%m-%d")
    recent_exp = sorted(
        [e for e in expenses if e.get("amount", 0) > 0],
        key=lambda x: x.get("date", ""), reverse=True
    )[:30]
    exp_lines  = "\n".join(
        f"  - {e['date']} | {e['category']} | {e.get('description','–')} | Rp {e['amount']:,.0f}"
        for e in recent_exp
    ) or "  (no data yet)"

    # Current month spending by category
    cur_month = today.strftime("%Y-%m")
    cat_this_month = {}
    for e in expenses:
        if e.get("date","").startswith(cur_month) and e.get("amount",0) > 0:
            cat_this_month[e["category"]] = cat_this_month.get(e["category"],0) + e["amount"]
    cat_lines = ", ".join(f"{k}: Rp {v:,.0f}" for k,v in cat_this_month.items()) or "no data yet"

    # Saving goals summary
    goals_lines = "\n".join(
        f"  - {g['goal_name']}: saved Rp {g['current_savings']:,.0f} / target Rp {g['target_amount']:,.0f} ({g['current_savings']/g['target_amount']*100:.1f}%), need Rp {g['monthly_needed']:,.0f}/month"
        for g in goals
    ) or "  (no goals yet)"

    # Budget allocation summary
    budget_items = budget.get("budget_items", {})
    budget_lines = ", ".join(f"{k}: Rp {v:,.0f}" for k,v in budget_items.items()) or "not set"

    total_exp   = sum(e["amount"] for e in expenses)
    net         = income - total_exp

    history_str = "\n".join(f"{h['role'].upper()}: {h['content']}" for h in chat_history[-8:])

    full_prompt = f"""You are FinBot, a smart and friendly personal finance assistant.
You have FULL ACCESS to the user's financial data and can answer specific questions about transactions,
expenses, savings, budgets, and their financial condition accurately.

IMPORTANT DATE REFERENCE:
- Today's date    : {today_str} ({today.strftime('%A, %d %B %Y')})
- Yesterday's date: {yesterday}
- This month      : {today.strftime('%B %Y')} ({today.strftime('%Y-%m')})

━━━━━━━━━━━━━━━━━━━━━━━━
USER FINANCIAL DATA:

Monthly Income : Rp {income:,.0f}
Total Expenses : Rp {total_exp:,.0f}
Net Balance    : Rp {net:,.0f}

Allocated Budget:
{budget_lines}

{today.strftime('%B %Y')} Expenses by Category:
{cat_lines}

Recent Transactions (sorted newest first):
{exp_lines}

Savings Goals:
{goals_lines}
━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:
- Reply in English, friendly and concise (maximum 250 words)
- When user asks about "today" → filter transactions where date == {today_str}
- When user asks about "yesterday" → filter transactions where date == {yesterday}
- When user asks about "this month" → filter transactions where date starts with {today.strftime('%Y-%m')}
- Always state the exact date you are checking when answering time-based questions
- Use Rp format for all currency values, use emojis when appropriate
- If no transactions match the date, clearly say there are none
{f"Conversation History:{chr(10)}{history_str}" if history_str else ""}
USER: {user_msg}
FINBOT:"""

    try:
        reply = model.generate_content(full_prompt).text
    except Exception as e:
        reply = f"Sorry, something went wrong. Please try again! ({str(e)})"
    chat_history.append({"role": "user",      "content": user_msg})
    chat_history.append({"role": "assistant", "content": reply})
    return jsonify({"reply": reply})


@app.route("/api/chat/clear", methods=["POST"])
def clear_chat():
    chat_history.clear()
    return jsonify({"success": True})


# ══════════════════════════════════════════════════════════════════════════════
# API: SAVINGS GOAL PLANNER  →  goals.json
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/savings/plan", methods=["POST"])
def savings_plan():
    d               = request.json
    goal_name       = d.get("goal_name", "My Goal")
    target_amount   = float(d.get("target_amount", 0))
    current_savings = float(d.get("current_savings", 0))
    months          = int(d.get("timeline_months", 12))
    income          = float(d.get("monthly_income", 0))

    remaining      = target_amount - current_savings
    monthly_needed = remaining / months if months > 0 else remaining
    savings_rate   = (monthly_needed / income * 100) if income > 0 else 0

    goals    = read_json(GOALS_FILE)
    # Create goal object
    new_goal = {
        "id":              int(datetime.now().timestamp() * 1000),
        "goal_name":       goal_name,
        "target_amount":   target_amount,
        "current_savings": current_savings,
        "timeline_months": months,
        "monthly_income":  income,
        "monthly_needed":  monthly_needed,
        "savings_rate":    savings_rate,
        "timestamp":       datetime.now().isoformat(),
    }

    # Check whether this is a new goal or an update
    idx      = next((i for i, g in enumerate(goals) if g.get("goal_name") == goal_name), None)
    is_new   = idx is None
    prev_savings = 0 if is_new else goals[idx].get("current_savings", 0)

    if is_new:
        goals.append(new_goal)
    else:
        goals[idx] = new_goal

    write_json(GOALS_FILE, goals)

    # Record savings difference as an expense transaction
    diff = current_savings - prev_savings
    if diff != 0:
        finance = read_json(FINANCE_DATA_FILE)
        finance["expenses"].append({
            "id":          int(datetime.now().timestamp() * 1000),
            "date":        datetime.now().strftime("%Y-%m-%d"),
            "category":    "Saving Goal",
            "description": f"Saved for {goal_name}",
            "amount":      diff,
            "created_at":  datetime.now().isoformat(),
        })
        write_json(FINANCE_DATA_FILE, finance)

    return jsonify({
        "success":          True,
        "goal":             new_goal,
        "monthly_needed":   monthly_needed,
        "remaining":        remaining,
        "progress_percent": (current_savings / target_amount * 100) if target_amount > 0 else 0,
    })


@app.route("/api/savings/goals/<int:gid>/ai", methods=["GET"])
def goal_ai_advice(gid):
    # Find goal by ID
    goals = read_json(GOALS_FILE)
    g     = next((x for x in goals if x["id"] == gid), None)
    if not g:
        return jsonify({"error": "Goal not found"}), 404

    target   = g["target_amount"]
    current  = g["current_savings"]
    months   = g["timeline_months"]
    income   = g.get("monthly_income", 0)
    needed   = g["monthly_needed"]
    rem      = target - current
    pct      = (current / target * 100) if target > 0 else 0
    rate     = (needed / income * 100) if income > 0 else 0

    prompt = f"""
You are a personal financial planner who helps users create and achieve savings goals in a realistic, disciplined, and measurable way.

Here is the user's financial goal data:

Goal Name:
{g["goal_name"]}

Target Amount:
Rp {target:,.0f}

Current Savings:
Rp {current:,.0f} ({pct:.1f}% achieved)

Remaining Amount:
Rp {rem:,.0f}

Time Horizon:
{months} months

Monthly Income:
Rp {income:,.0f}

Required Monthly Savings:
Rp {needed:,.0f} ({rate:.1f}% of income)

Based on the data above:

1. Evaluate whether this savings goal is realistic within the specified timeframe
2. Explain the factors that support or hinder achieving the goal
3. Provide practical strategies to help the user reach the goal faster
4. Recommend suitable savings or investment instruments
5. Create savings milestones every 3 months until the goal is achieved

Use the following format:

Goal Feasibility
- Assess whether the goal is realistic based on the current situation
- Include relevant reasons from the available data

Achievement Strategy
- Provide 3 practical strategies
- Include estimated impact or additional savings potential in Rp

3-Month Milestones
- Show cumulative savings targets every 3 months
- Use a clean and easy-to-read format

Requirements:
- Use professional, clear, and easy-to-understand English
- All amounts must use Rupiah (Rp) format
- Analysis must be based entirely on the provided data
- Do not make assumptions beyond the available data
- Maximum 300 words
"""
    try:
        response = model.generate_content(prompt)
        return jsonify({"advice": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/savings/goals", methods=["GET"])
def get_goals():
    # Return all saved goals
    return jsonify(read_json(GOALS_FILE))


@app.route("/api/savings/goals/<int:gid>/deposit", methods=["POST"])
def deposit_goal(gid):
    d      = request.json
    amount = float(d.get("amount", 0))
    goals  = read_json(GOALS_FILE)
    # Find goal by ID
    goal   = next((g for g in goals if g["id"] == gid), None)
    if not goal:
        return jsonify({"error": "Goal not found"}), 404
    prev = goal.get("current_savings", 0)
    goal["current_savings"] = max(0, prev + amount)
    goal["updated_at"]      = datetime.now().isoformat()
    write_json(GOALS_FILE, goals)

    # Record transaction so it appears in expenses and reports
    actual_amount = goal["current_savings"] - prev  
    if actual_amount != 0:
        finance = read_json(FINANCE_DATA_FILE)
        finance["expenses"].append({
            "id":          int(datetime.now().timestamp() * 1000),
            "date":        datetime.now().strftime("%Y-%m-%d"),
            "category":    "Saving Goal",
            "description": f"Saved for {goal['goal_name']}",
            "amount":      actual_amount,
            "created_at":  datetime.now().isoformat(),
        })
        write_json(FINANCE_DATA_FILE, finance)

    return jsonify({"success": True, "goal": goal})


@app.route("/api/savings/goals/<int:gid>", methods=["PUT"])
def edit_goal(gid):
    d     = request.json
    goals = read_json(GOALS_FILE)
    # Find goal by ID
    goal  = next((g for g in goals if g["id"] == gid), None)
    if not goal:
        return jsonify({"error": "Goal not found"}), 404
    # Update editable goal fields
    for key in ["goal_name", "target_amount", "current_savings", "timeline_months"]:
        if key in d:
            goal[key] = float(d[key]) if key != "goal_name" else d[key]
    goal["monthly_needed"] = goal["target_amount"] / goal["timeline_months"] if goal["timeline_months"] > 0 else 0
    goal["updated_at"]     = datetime.now().isoformat()
    write_json(GOALS_FILE, goals)
    return jsonify({"success": True, "goal": goal})


@app.route("/api/savings/goals/<int:gid>", methods=["DELETE"])
def delete_goal(gid):
    # Remove goal from storage
    goals = [g for g in read_json(GOALS_FILE) if g["id"] != gid]
    write_json(GOALS_FILE, goals)
    return jsonify({"success": True})


@app.route("/api/savings/investment", methods=["POST"])
def investment_guidance():
    d       = request.json
    risk    = d.get("risk_level", "Low")
    amount  = float(d.get("amount", 0))
    horizon = d.get("horizon", "1 year")

    # Build AI prompt for investment recommendations
    prompt = f"""
You are a financial education and investment advisor who helps users understand investment options based on their risk profile, financial goals, and investment horizon.

Here is the user's investment profile:

Investment Capital:
Rp {amount:,.0f}

Risk Tolerance:
{risk}

Investment Horizon:
{horizon}

Based on the information above:

1. Determine the most suitable investment instruments for the user's profile
2. Explain why those instruments are appropriate
3. Create a balanced portfolio allocation recommendation
4. Provide a realistic estimate of annual returns
5. Explain the main risks and how to mitigate them
6. Provide practical steps to start investing in Indonesia

Use the following format:

Recommended Investment Instruments
- List suitable investment instruments based on the user's risk profile and investment horizon
- Briefly explain why each instrument is recommended

Suggested Portfolio Allocation
- Provide percentage allocations across investment instruments
- Include Rupiah amounts for each allocation

Estimated Returns
- Provide a realistic annual return range based on historical Indonesian market performance
- Explain that returns may vary depending on market conditions

Risks to Consider
- Explain the main risks of the recommended investments
- Include simple ways to reduce or manage those risks

How to Get Started
- Provide practical steps for beginning an investment journey
- Include examples of Indonesian investment platforms such as Bibit, Bareksa, IPOT, or Pluang where relevant

Requirements:
- Use professional, concise, and easy-to-understand English
- All monetary values must use Rupiah (Rp) format
- Focus on Indonesian investment market conditions
- Include a statement that this analysis is educational and not official investment advice
- Avoid guaranteeing profits or returns
- Maximum 350 words
"""
    return jsonify({"guidance": model.generate_content(prompt).text})

# ══════════════════════════════════════════════════════════════════════════════
# API: REPORT  →  Read data from all JSON files
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/report/summary", methods=["GET"])
def report_summary():
    budget   = read_json(BUDGET_FILE)
    finance  = read_json(FINANCE_DATA_FILE)
    goals    = read_json(GOALS_FILE)
    expenses = finance.get("expenses", [])

    total_exp  = sum(e["amount"] for e in expenses)
    # Aggregate expenses by category
    categories = {}
    for e in expenses:
        categories[e["category"]] = categories.get(e["category"], 0) + e["amount"]

    income       = budget.get("income", 0)
    savings      = goals[-1] if goals else {}
    total_saving = sum(g.get("current_savings", 0) for g in goals)

    return jsonify({
        "has_budget":      bool(budget),
        "has_expenses":    bool(expenses),
        "has_savings":     bool(goals),
        "income":          income,
        "total_expenses":  total_exp,
        "total_saving":    total_saving,
        "net":             income - total_exp,
        "categories":      categories,
        "expense_count":   len(expenses),
        "savings_goal":    savings,
        "budget_expenses": budget.get("expenses", {}),
        "generated_at":    datetime.now().strftime("%d %B %Y, %H:%M"),
    })


@app.route("/api/report/monthly", methods=["GET"])
def report_monthly():
    month = int(request.args.get("month", 1))
    year  = int(request.args.get("year",  2025))
    prefix = f"{year}-{month:02d}"

    budget   = read_json(BUDGET_FILE)
    finance  = read_json(FINANCE_DATA_FILE)
    goals    = read_json(GOALS_FILE)

    # Filter expenses for selected month
    all_exp  = finance.get("expenses", [])
    expenses = [e for e in all_exp if e.get("date","").startswith(prefix)]

    total_exp  = sum(e["amount"] for e in expenses)
    # Aggregate monthly expenses by category
    categories = {}
    for e in expenses:
        categories[e["category"]] = categories.get(e["category"], 0) + e["amount"]

    has_data  = len(expenses) > 0
    income    = budget.get("income", 0) if has_data else 0
    net       = income - total_exp
    score     = None
    if has_data and income > 0 and total_exp > 0:
        score = round(max(0, min(100, (income - total_exp) / income * 100)))

    raw_budget_items    = read_json(BUDGET_FILE).get("budget_items", {}) if has_data else {}
    budget_items_report = {**raw_budget_items}

    # Filter goals by month/year:
    # - Only displayed if the goal was created <= the selected month
    # - If the goal is already at 100%, it will not appear in the month following the month it was achieved.
    filtered_goals = []
    for g in goals:
        created = g.get("timestamp", "")[:7]  # "YYYY-MM"
        if not created or created > prefix:
            continue  # there are no goals this month
        pct = g["current_savings"] / g["target_amount"] * 100 if g.get("target_amount", 0) > 0 else 0
        if pct >= 100:
            dep_dates = [
                e["date"][:7] for e in all_exp
                if e.get("category") == "Saving Goal"
                and g["goal_name"] in e.get("description", "")
            ]
            completed_month = max(dep_dates) if dep_dates else created
            if prefix > completed_month:
                continue  # is finished, don't show up next month
        filtered_goals.append(g)

    return jsonify({
        "month": month, "year": year,
        "income": income, "total_expenses": total_exp,
        "net": net, "health_score": score,
        "categories": categories, "expenses": expenses,
        "goals": filtered_goals, "budget_items": budget_items_report,
    })

@app.route("/api/report/ai-insight", methods=["POST"])
def report_ai_insight():
    d          = request.json
    month      = d.get("month", 1)
    year       = d.get("year",  2025)
    income     = d.get("income", 0)
    total_exp  = d.get("total_expenses", 0)
    total_save = d.get("total_saving", 0)
    net        = d.get("net", 0)
    score      = d.get("health_score", 0)
    categories = d.get("categories", {})

    month_name    = datetime(year, month, 1).strftime("%B %Y")
    cat_lines     = "\n".join(f"  - {k}: Rp {v:,.0f}" for k,v in categories.items()) or "  (none)"
    savings_goals = d.get("goals", [])
    goals_lines   = "\n".join(
        f"  - {g['goal_name']}: saved Rp {g['current_savings']:,.0f} / target Rp {g['target_amount']:,.0f} ({g['current_savings']/g['target_amount']*100:.1f}%)"
        for g in savings_goals if g.get("target_amount", 0) > 0
    ) or "  (none)"

    prompt = f"""
You are a personal financial analyst who helps users understand their monthly financial condition objectively, measurably, and clearly.

Here is the financial data for {month_name}:

Income:
Rp {income:,.0f}

Total Expenses:
Rp {total_exp:,.0f}

Net Balance:
Rp {net:,.0f}

Financial Health Score:
{score}/100

Expense Breakdown by Category:
{cat_lines}

Saving Goals Progress:
{goals_lines}

Based on the data above:

1. Evaluate the user's financial condition during this month
2. Identify positive achievements and strengths
3. Highlight spending areas that need improvement
4. Explain the impact of spending patterns on financial health
5. Provide concrete and measurable recommendations for next month

Use the following format:

Monthly Summary – {month_name}
- Evaluate the overall financial condition in 2–3 sentences
- Relate it to income, expenses, net balance, and health score

Positive Achievements
- Mention what is already going well
- Explain achievements from both spending control and savings progress

Areas for Improvement
- Identify spending categories that are too high or inefficient
- Include specific amounts and their impact on financial condition

Recommendations for Next Month
- Provide 3 specific and realistic action steps
- Each recommendation must include a clear amount or percentage target
- Focus on improving cash flow, controlling expenses, or accelerating savings

Requirements:
- Use professional, concise, and easy-to-understand English
- All monetary values must use Rupiah (Rp) format
- Analysis must be based entirely on the provided data
- Do not make assumptions beyond the available information
- Avoid overly generic or abstract recommendations
- Maximum 350 words
"""
    try:
        response = model.generate_content(prompt)
        return jsonify({"insight": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/report/download", methods=["GET"])
def download_report():
    month      = int(request.args.get("month", datetime.now().month))
    year       = int(request.args.get("year",  datetime.now().year))
    ai_insight = request.args.get("ai_insight", "")
    prefix     = f"{year}-{month:02d}"
    month_name = datetime(year, month, 1).strftime("%B %Y")

    budget  = read_json(BUDGET_FILE)
    finance = read_json(FINANCE_DATA_FILE)
    goals   = read_json(GOALS_FILE)

    all_exp  = finance.get("expenses", [])
    # Filter monthly expense records
    expenses = [e for e in all_exp if e.get("date","").startswith(prefix)]
    income   = budget.get("income", 0)
    total_exp   = sum(e["amount"] for e in expenses)
    net         = income - total_exp
    # Aggregate expenses by category
    categories  = {}
    for e in expenses:
        categories[e["category"]] = categories.get(e["category"],0) + e["amount"]
    
    # Calculate financial health score
    score = None
    if income > 0 and total_exp > 0:
        score = round(max(0, min(100, (income - total_exp) / income * 100)))

    # Apply Saving Goal budget logic
    saving_limit = 0
    for g in goals:
        goal_month = g.get("timestamp","")[:7]
        saving_limit += g.get("current_savings",0) if goal_month==prefix else g.get("monthly_needed",0)
    budget_items = {**budget.get("budget_items", {})}
    if saving_limit > 0:
        budget_items["Saving Goal"] = saving_limit

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=30)
    styles = getSampleStyleSheet()
    # Helper for custom paragraph styles
    S = lambda name, **kw: ParagraphStyle(name, parent=styles["Normal"], **kw)
    s_title = S("T", fontSize=20, textColor=colors.HexColor("#6C63FF"), spaceAfter=4, alignment=TA_CENTER, fontName="Helvetica-Bold")
    s_sub   = S("S", fontSize=9,  textColor=colors.HexColor("#888888"))
    s_h2    = S("H2",fontSize=13, textColor=colors.HexColor("#6C63FF"), spaceBefore=14, spaceAfter=4, fontName="Helvetica-Bold")
    s_body  = S("B", fontSize=10, spaceAfter=3)

    # Reusable styled table generator
    def tbl(data, col_widths, header_color="#6C63FF"):
        t = Table(data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,0),colors.HexColor(header_color)),
            ("TEXTCOLOR",(0,0),(-1,0),colors.white),
            ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.HexColor("#F5F5FF"),colors.white]),
            ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#CCCCCC")),
            ("FONTSIZE",(0,0),(-1,-1),9),
            ("PADDING",(0,0),(-1,-1),6),
        ]))
        return t

    elems = []

    # PDF header section
    elems.append(Paragraph("Monthly Financial Report", s_title))
    elems.append(Paragraph(f"{month_name}  ·  {datetime.now().strftime('%H:%M WIB')}", s_sub))
    elems.append(Spacer(1, 0.2*inch))

    # Financial summary table
    elems.append(Paragraph("Financial Summary", s_h2))
    elems.append(tbl([
        ["Description", "Amount"],
        ["Income",      f"Rp {income:,.0f}"],
        ["Expenses",    f"Rp {total_exp:,.0f}"],
        ["Net Balance", f"Rp {net:,.0f}"],
        ["Health Score", f"{score}/100"],
    ], [3*inch, 3*inch]))

    # Expense breakdown section
    elems.append(Paragraph("Expense Breakdown", s_h2))
    if categories:
        total_cat = sum(categories.values())
        # Generate pie chart for expense distribution
        try:
            PALETTE = ["#6C63FF","#FF6584","#43D9AD","#FFB347","#87CEEB","#DDA0DD","#98FB98","#F0E68C"]
            fig, ax = plt.subplots(figsize=(4,3))
            fig.patch.set_facecolor("white")
            ax.set_facecolor("white")
            lbls = list(categories.keys())
            vals = list(categories.values())
            clrs = PALETTE[:len(lbls)]
            ax.pie(vals, labels=lbls, colors=clrs, autopct="%1.1f%%", startangle=140,
                   wedgeprops=dict(width=0.55))
            ax.set_title("Expenses by Category", fontsize=10)
            pie_buf = io.BytesIO()
            plt.savefig(pie_buf, format="png", dpi=110, bbox_inches="tight", facecolor="white")
            plt.close()
            pie_buf.seek(0)
            from reportlab.platypus import Image as RLImage
            elems.append(RLImage(pie_buf, width=3.5*inch, height=2.5*inch))
        except: pass

        cat_rows = [["Category", "Amount","% Total"]]
        for cat, amt in sorted(categories.items(), key=lambda x:-x[1]):
            cat_rows.append([cat, f"Rp {amt:,.0f}", f"{amt/total_cat*100:.1f}%"])
        cat_rows.append(["TOTAL", f"Rp {total_cat:,.0f}", "100%"])
        elems.append(tbl(cat_rows, [2.5*inch,2.5*inch,1*inch], "#43D9AD"))
    else:
        elems.append(Paragraph("No expense data available for this month.", s_body))

    # Budget vs Actual section
    elems.append(Paragraph("Budget vs Actual", s_h2))
    if budget_items:
        # Generate comparison bar chart
        try:
            PALETTE = ["#6C63FF","#FF6584","#43D9AD","#FFB347","#87CEEB","#DDA0DD","#98FB98","#F0E68C"]
            cats_b = list(budget_items.keys())
            limits = [budget_items[c] for c in cats_b]
            # Calculate actual spending for each category
            aktual = []
            for c in cats_b:
                a = sum(e["amount"] for e in expenses if e.get("category")==c)
                aktual.append(a)
            x = range(len(cats_b))
            fig2, ax2 = plt.subplots(figsize=(5,2.5))
            fig2.patch.set_facecolor("white")
            ax2.set_facecolor("#F8F8FF")
            w = 0.35
            bars1 = ax2.bar([i-w/2 for i in x], limits, w, label="Budget",  color="#6C63FF", alpha=0.7)
            bars2 = ax2.bar([i+w/2 for i in x], aktual, w, label="Actual",  color="#43D9AD")
            for b,v in zip(bars2, aktual):
                if v > 0:
                    ax2.text(b.get_x()+b.get_width()/2, b.get_height()+max(limits+aktual)*0.01,
                             f"{v/1e6:.1f}jt" if v>=1e6 else f"{int(v/1e3)}rb", ha="center", va="bottom", fontsize=6)
            ax2.set_xticks(list(x))
            ax2.set_xticklabels([c[:8] for c in cats_b], fontsize=7, rotation=20, ha="right")
            ax2.legend(fontsize=7)
            ax2.set_title("Budget vs Actual", fontsize=9)
            bar_buf = io.BytesIO()
            plt.savefig(bar_buf, format="png", dpi=110, bbox_inches="tight", facecolor="white")
            plt.close()
            bar_buf.seek(0)
            elems.append(RLImage(bar_buf, width=5*inch, height=2.5*inch))
        except: pass

        bv_rows = [["Category", "Budget", "Actual", "Status"]]
        for c in cats_b:
            lim = budget_items[c]
            act = sum(e["amount"] for e in expenses if e.get("category")==c)
            pct = act/lim*100 if lim>0 else 0
            st  = "🔴 Exceeded" if pct>100 else ("✅ On Target" if pct==100 else ("🟡 Near Limit" if pct>=80 else "🟢 Safe"))
            bv_rows.append([c, f"Rp {lim:,.0f}", f"Rp {act:,.0f}", st])
        elems.append(tbl(bv_rows, [2*inch,1.5*inch,1.5*inch,1*inch], "#FF6584"))
    else:
        elems.append(Paragraph("No budget data available.", s_body))

    # Saving goals section
    elems.append(Paragraph("Saving Goals", s_h2))
    if goals:
        for g in goals:
            pct = g["target_amount"]>0 and g["current_savings"]/g["target_amount"]*100 or 0
            elems.append(Paragraph(
                f"<b>{g['goal_name']}</b>  Rp {g['current_savings']:,.0f} / Rp {g['target_amount']:,.0f}  ({pct:.1f}%)", s_body))
            elems.append(Paragraph(
                f"Need to Save: Rp {g['monthly_needed']:,.0f}/month", s_body))
            elems.append(Spacer(1,0.05*inch))
    else:
        elems.append(Paragraph("No saving goals available.", s_body))

    # AI-generated financial insights
    if ai_insight:
        elems.append(Paragraph("AI Financial Insights", s_h2))
        for line in ai_insight.split("\n"):
            if line.strip():
                elems.append(Paragraph(line.replace("###","").strip(), s_body))
                elems.append(Spacer(1,0.02*inch))

    # Report footer
    elems.append(Spacer(1,0.3*inch))
    elems.append(Paragraph(f"Generated by FinAI  ·  {datetime.now().strftime('%d %B %Y, %H:%M')}", s_sub))

    doc.build(elems)
    buf.seek(0)
    # Generate downloadable PDF filename
    fname = f"report_{year}_{month:02d}.pdf"
    return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name=fname)

# AI cache: get stored result
@app.route("/api/ai-cache/<path:key>", methods=["GET"])
def get_ai_cache(key):
    try:
        from urllib.parse import unquote
        key = unquote(key)
        cache = read_json(AI_CACHE_FILE) if os.path.exists(AI_CACHE_FILE) else {}
        return jsonify({"result": cache.get(key, "")})
    except Exception:
        return jsonify({"result": ""})

# AI cache: save result
@app.route("/api/ai-cache/<path:key>", methods=["POST"])
def set_ai_cache(key):
    try:
        from urllib.parse import unquote
        key = unquote(key)
        cache = read_json(AI_CACHE_FILE) if os.path.exists(AI_CACHE_FILE) else {}
        cache[key] = request.json.get("result", "")
        write_json(AI_CACHE_FILE, cache)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# AI cache: delete result
@app.route("/api/ai-cache/<path:key>", methods=["DELETE"])
def del_ai_cache(key):
    try:
        from urllib.parse import unquote
        key = unquote(key)
        cache = read_json(AI_CACHE_FILE) if os.path.exists(AI_CACHE_FILE) else {}
        cache.pop(key, None)
        write_json(AI_CACHE_FILE, cache)
    except Exception:
        pass
    return jsonify({"success": True})

# Application entry point
if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    app.run(debug=debug, port=port)