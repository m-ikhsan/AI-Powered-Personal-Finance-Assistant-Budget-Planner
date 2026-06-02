# FinAI — AI-Powered Personal Finance Assistant

> Take control of your personal finances with the power of Google Gemini AI.
> Budgeting, expense tracking, AI consultation, savings planning, and PDF reports — all in one web application.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [How to Use](#-how-to-use)
- [CSV Format](#-csv-format-for-expense-upload)
- [API Endpoints](#-api-endpoints)
- [Important Notes](#-important-notes)

---

## ✨ Features

| Page | Description |
|---|---|
| 🏠 **Dashboard** | Real-time financial overview: income, total expenses, net balance, and savings progress |
| 📊 **Budget Planner** | Set monthly budgets per category, track budget vs actual spending, and get AI-powered 50/30/20 analysis |
| 💳 **Expense Analyzer** | Log expenses manually or upload a CSV file, and receive AI-generated spending pattern insights |
| 🤖 **AI Advisor** | Personal finance chatbot with full access to your financial data for accurate, context-aware answers |
| 🎯 **Savings & Invest** | Create savings goals with auto-calculated monthly targets, log deposits, and get investment guidance based on your risk profile |
| 📄 **Monthly Report** | Complete monthly financial summary with charts, AI evaluation, and downloadable PDF |

---

## 🛠️ Tech Stack

- **Backend** — Python 3.10+, Flask 3.0
- **AI Engine** — Google Gemini 2.5 Flash API
- **Data Visualization** — Matplotlib (charts rendered as Base64)
- **PDF Generator** — ReportLab
- **Frontend** — HTML5, CSS3, Vanilla JavaScript
- **Storage** — Local JSON files (`budget.json`, `finance_data.json`, `goals.json`)

---

## 🗂️ Project Structure

```
finance_assistant/
├── app.py                      ← Flask server and all API endpoints
├── requirements.txt            ← Python dependencies
├── .env.example                ← Environment configuration template
├── sample_expenses.csv         ← Sample CSV data for testing
│
├── templates/
│   ├── base.html               ← Main layout and sidebar navigation
│   ├── index.html              ← Dashboard page
│   ├── budget.html             ← Budget Planner page
│   ├── expense.html            ← Expense Analyzer page
│   ├── advisor.html            ← AI Financial Advisor page
│   ├── savings.html            ← Savings Goal Planner page
│   └── report.html             ← Financial Report page
│
├── static/
│   ├── css/
│   │   └── style.css           ← Global styling and UI theme
│   │
│   └── js/
│       ├── main.js             ← Shared utilities and common functions
│       ├── dashboard.js        ← Dashboard logic and financial summary
│       ├── budget.js           ← Budget Planner functionality
│       ├── expense.js          ← Expense Analyzer functionality
│       ├── advisor.js          ← AI Financial Advisor chat logic
│       ├── savings.js          ← Savings Goal and Investment Guidance logic
│       └── report.js           ← Financial Report and PDF generation logic
│
├── budget.json                 ← Income and budget allocation data
├── finance_data.json           ← Expense transaction data
├── goals.json                  ← Savings goals data
└── ai_cache.json               ← Cached AI analysis results
```

---

## ✅ Prerequisites

Make sure you have the following installed:

- [Python 3.10+](https://www.python.org/downloads/)
- `pip` (included with Python installation)
- A modern browser (Chrome, Firefox, or Edge)
- An active internet connection (required for Gemini API calls)

---

## 🚀 Installation & Setup

### 1. Clone or Download the Repository

```bash
git clone https://github.com/m-ikhsan/AI-Powered-Personal-Finance-Assistant-Budget-Planner.git
cd finance_assistant
```

### 2. Create a Virtual Environment

```bash
python -m venv venv
```

Activate the virtual environment:

```bash
# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Your API Key

Copy the environment template:

```bash
cp .env.example .env
```

Open the `.env` file and fill in your Gemini API key:

```env
GEMINI_API_KEY=your_actual_api_key_here
```

> 🔑 Get a **free** API key at: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### 5. Run the Application

```bash
python app.py
```

Open your browser and go to: **[http://localhost:5000](http://localhost:5000)**

---

## 📖 How to Use

Recommended flow for first-time users:

1. **Budget Planner** → Enter your monthly income and allocate a budget per spending category
2. **Expense Analyzer** → Log daily expenses manually or upload a CSV file in bulk
3. **AI Advisor** → Ask FinBot about your financial condition or request personalized advice
4. **Savings & Invest** → Create a savings goal and set your monthly savings target
5. **Monthly Report** → Review your end-of-month summary and download it as a PDF

---

## 📄 CSV Format for Expense Upload

Use the following format to import expenses in bulk:

```csv
date,category,description,amount
2025-01-01,Makan & Minum,Lunch,25000
2025-01-02,Transportasi,Grab to office,35000
2025-01-03,Tagihan,Electricity bill,150000
```

| Column | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | Transaction date |
| `category` | string | Spending category |
| `description` | string | Transaction description *(optional)* |
| `amount` | number | Amount in Indonesian Rupiah |

**Available categories:** `Makan & Minum`, `Transportasi`, `Tagihan`, `Hiburan`, `Kesehatan`, `Pendidikan`, `Belanja`, `Saving Goal`, `Lainnya`

---

## 🔌 API Endpoints

<details>
<summary><b>Income</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/income/save` | Save monthly income |
| `GET` | `/api/income/get` | Retrieve current income data |

</details>

<details>
<summary><b>Budget Planner</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/budget/save` | Save budget allocation per category |
| `GET` | `/api/budget/get` | Get budget and actual spending per category |
| `POST` | `/api/budget/ai-analyze` | AI-powered budget analysis via Gemini |

</details>

<details>
<summary><b>Expense Analyzer</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/expense/add` | Add a single expense transaction |
| `POST` | `/api/expense/upload` | Import transactions from a CSV file |
| `GET` | `/api/expense/list` | Retrieve all expense transactions |
| `DELETE` | `/api/expense/delete/<id>` | Delete a transaction by ID |
| `DELETE` | `/api/expense/clear` | Delete all expense transactions |
| `GET` | `/api/expense/analyze` | AI-powered spending pattern analysis |

</details>

<details>
<summary><b>AI Advisor</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Send a message to FinBot |
| `POST` | `/api/chat/clear` | Clear conversation history |

</details>

<details>
<summary><b>Savings & Investment</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/savings/plan` | Create or update a savings goal |
| `GET` | `/api/savings/goals` | Retrieve all savings goals |
| `GET` | `/api/savings/goals/<id>/ai` | Get AI advice for a specific goal |
| `POST` | `/api/savings/goals/<id>/deposit` | Log a deposit to a savings goal |
| `PUT` | `/api/savings/goals/<id>` | Edit a savings goal |
| `DELETE` | `/api/savings/goals/<id>` | Delete a savings goal |
| `POST` | `/api/savings/investment` | Get AI-generated investment guidance |

</details>

<details>
<summary><b>Monthly Report</b></summary>

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/report/summary` | Get a full financial data summary |
| `GET` | `/api/report/monthly?month=&year=` | Get financial data filtered by month |
| `POST` | `/api/report/ai-insight` | AI-generated monthly financial evaluation |
| `GET` | `/api/report/download?month=&year=` | Download monthly report as PDF |

</details>

---

## ⚠️ Important Notes

- **Data is stored permanently** in local JSON files — it will not be lost when the server restarts
- **AI Advisor chat history** is stored in server memory — it will be cleared when the server restarts
- **An internet connection is required** for all features that call the Gemini AI API
- **Single-user per instance** — this application does not currently support multiple user accounts
- The application is optimized for the **Indonesian financial context** (Rupiah currency, local investment platforms)

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.


