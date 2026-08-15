# 🌊 SumScale 2.0 — Multimodal AI Intelligence & Life-Safety Platform


---

## 🎯 Executive Overview

**SumScale 2.0** is an enterprise-grade, multimodal AI Life-Safety and Decision Intelligence Platform. Designed to solve the friction of unstructured, multi-format human data, SumScale seamlessly ingest medical lab reports, financial spreadsheets, voice notes, scanned receipts, and suspicious messages — transforming them into structured summaries, real-time risk scores, automated calendar schedules, emergency safety broadcasts, and interactive multi-turn conversations.

```
📁 Unstructured Input ───► 🤖 Gemini 2.0 Multimodal Vision & Audio ───► 📊 Instant Risk Score
   (PDF/CSV/Audio/Images)   + Groq LLaMA 3.3 70B Text Synthesis      + 🚨 Trust Circle Broadcast
                                                                     + ⏰ Email & Push Reminders
```

---

## ✨ Core Capabilities & Features

### 📄 1. Intelligent Document Summarization & Deep Extraction
- **Multi-Format Ingestion**: Native parsing for PDFs, Scanned Medical Reports, Financial CSV/XLSX Spreadsheets, Receipts, and Images (`JPEG`, `PNG`, `WEBP`, `TIFF`).
- **Concise AI Summarization**: Converts multi-page documents, dense lab reports, and legal agreements into clean, structured summaries highlighting key findings, risk factors, and actionable recommendations.
- **Structured Knowledge Extraction**: Categorizes documents by severity (**High Risk**, **Medium Risk**, **Low Risk**) with clear, layperson-friendly guidance.

### 📈 2. Business Insights & Automated Schedule Intelligence
- **Deadline & Metric Harvesting**: AI automatically scans uploaded business contracts, invoices, financial spreadsheets, and reports to detect hidden payment due dates, tax deadlines, compliance milestones, and renewal terms.
- **Insight-Driven Reminders**: Automatically converts detected business milestones into actionable reminders. When triggered, SumScale dispatches rich HTML email alerts featuring priority badges, contextual business notes, and direct portal action links.

### 🛡️ 3. Threat-Intelligence Fraud & Scam Shield
- **Multi-API Risk Verification**: Scans suspicious text messages, emails, phishing links, phone numbers, and fake invoices.
- **Threat Engines**: Integrates **Google Safe Browsing v4**, **VirusTotal v3**, **IPQualityScore**, and **WhoisXML** to verify domain age, IP reputation, malware hashes, and SMS phishing probability.
- **Actionable Remediation**: Generates step-by-step defensive actions for non-technical users.

### ⏰ 4. Real-Time Reminders Hub & 5-Second Scheduler
- **Typable 12-Hour Time Interface**: User-friendly hour (`1-12`), minute (`0-59`), and `AM/PM` inputs automatically converted to standard UTC ISO timestamps.
- **5-Second Real-Time Polling**: Background **APScheduler** loop evaluates due dates every 5 seconds.
- **HTML Email Dispatch**: Sends beautifully formatted, high-priority email alerts directly to the user's Gmail inbox using **Brevo REST API** / **SMTP Mailer**.

### 👥 5. Trust Circle & Emergency Safety Network
- **Personal Safety Mesh**: Allows users to manage trusted contacts (Family, Friends, Doctors, Guardians) with designated relationship labels.
- **One-Click Risk Broadcast**: Instantly dispatches a structured safety alert email to Trust Circle members whenever a critical health anomaly or high-risk scam attempt is detected.

### 🎙️ 6. Voice Intelligence & Multilingual AI Copilot
- **Live Microphone Capture**: Browser `MediaRecorder` API with dynamic audio waveform visualization and instant Speech-to-Text transcription.
- **Text-to-Speech Output**: Integrated browser speech synthesis for hands-free audio responses.
- **Context-Aware Floating Assistant**: Floating AI copilot capable of answering follow-up queries on uploaded cases with multi-paragraph markdown rendering.

### 🌐 7. Vernacular i18n Localization
- Instant language switching across the entire UI and AI response pipeline:
  - 🇺🇸 **English (US)**
  - 🇮🇳 **Hindi (हिंदी)**
  - 🇮🇳 **Telugu (తెలుగు)**
  - 🇮🇳 **Tamil (தமிழ்)**
  - 🇮🇳 **Kannada (ಕನ್ನಡ)**

### 📊 8. Executive Dashboard & Severity Analytics
- **Donut Severity Breakdown**: High-contrast SVG Donut chart displaying risk metrics (**High Risk** in vibrant crimson `#ef4444`, **Low Risk** in `#006D77`).
- **2-Section Today Overview**: Streamlined side-by-side view featuring `📅 Scheduled Today` and `⏩ Upcoming Reminders`.

---

## 🛠️ Architecture & System Design

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FRONTEND LAYER (Vercel)                                │
│                     React 18 + Vite + Tailwind CSS + i18next Vernacular                │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ REST API (JSON / Multipart)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 BACKEND LAYER (Render)                                 │
│                 FastAPI (Python 3.11.9) + Uvicorn + Pydantic v2 + SlowAPI              │
└──────────────┬────────────────────────────┬────────────────────────────┬───────────────┘
               │                            │                            │
               ▼                            ▼                            ▼
┌────────────────────────────┐┌────────────────────────────┐┌───────────────────────────┐
│     AI INTELLIGENCE ENGINE ││   DATABASE & SCHEDULER     ││    SAFETY & EMAIL ENGINE  │
│  • Google Gemini 2.0/1.5   ││  • MongoDB Atlas Cloud      ││  • Brevo REST API / SMTP  │
│  • Groq LLaMA 3.3 70B      ││  • Motor Async Driver      ││  • PyJWT Authentication   │
│  • HTML5 Speech Synthesis  ││  • APScheduler (5s Loop)   ││  • Threat Intelligence    │
└────────────────────────────┘└────────────────────────────┘└───────────────────────────┘
```

| Layer | Technology | Function |
|---|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide Icons, i18next | Responsive SPA with 2-section dashboard, SVG donut charts, and vernacular i18n |
| **Backend** | FastAPI, Python 3.11.9, Pydantic v2, Uvicorn | Asynchronous REST backend handling uploads, JWT sessions, and background task queues |
| **Database** | MongoDB Atlas Cloud, Motor Async Driver | Cloud database storing users, encrypted case findings, reminders, and trust networks |
| **AI Models** | Google Gemini 2.0 Flash / Pro, Groq LLaMA 3.3 70B | Multimodal vision/audio extraction combined with sub-second LLM text reasoning |
| **Email & Security** | Brevo API, SMTP, PyJWT, Passlib (Bcrypt) | 6-digit Email OTP auth, passwordless login, and automated reminder emails |

---

## 📡 API Endpoint Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/send-otp` | Validates email & dispatches 6-digit verification OTP |
| `POST` | `/api/auth/verify-otp` | Verifies OTP code and issues JWT bearer token |
| `GET` | `/api/auth/me` | Fetches authenticated user profile & preferences |
| `POST` | `/api/cases/upload` | Processes multi-format uploads (PDF/Image/Audio/CSV) with Gemini AI |
| `GET` | `/api/cases/` | Lists user cases filtered by department or severity |
| `GET` | `/api/cases/{id}` | Retrieves full diagnostic case report |
| `GET` | `/api/reminders/` | Retrieves upcoming and overdue user reminders |
| `POST` | `/api/reminders/` | Creates a new scheduled reminder with local-to-UTC conversion |
| `PUT` | `/api/reminders/{id}` | Updates reminder status or scheduled time |
| `DELETE` | `/api/reminders/{id}` | Removes a reminder |
| `GET` | `/api/trust-circle/` | Lists trusted emergency contacts |
| `POST` | `/api/trust-circle/` | Adds a new contact to the user's Trust Circle |
| `POST` | `/api/trust-circle/alert` | Broadcasts an emergency safety alert to all Trust Circle members |
| `POST` | `/api/chat/message` | Interacts with context-aware document copilot |
| `GET` | `/health` | Verifies MongoDB Atlas & AI engine connectivity |

---

## 💻 Local Quickstart Guide

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **MongoDB Atlas** or local MongoDB instance (`mongodb://localhost:27017`)

### 1. Clone Repository
```bash
git clone https://github.com/shankss-18/SumScale-ai.git
cd SumScale-ai
```

### 2. Configure Environment (`.env`)
Create `backend/.env` using the template provided in `.env.example`:
```ini
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=sumscale_local
JWT_SECRET_KEY=your_64_character_random_secret_here
FRONTEND_URL=http://localhost:5173
ENVIRONMENT=development
PORT=8000
BREVO_API_KEY=your_brevo_api_key_here
SMTP_FROM_EMAIL=your_email@gmail.com
```

### 3. Launch Backend Service
```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend interactive OpenAPI documentation available at `http://localhost:8000/docs`*

### 4. Launch Frontend Service
```bash
cd ../frontend
npm install
npm run dev
```
*Frontend web application available at `http://localhost:5173`*

---

## 🌐 Live Production Deployments

- **Frontend SPA**: Hosted on [Vercel](https://sum-scale-ai.vercel.app)
- **Backend API**: Hosted on [Render Web Service](https://sumscale-ai-backend.onrender.com) (Python 3.11.9 Runtime)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

---

## 📄 License & Attribution
Designed and engineered by **Team SumScale**. All rights reserved.
