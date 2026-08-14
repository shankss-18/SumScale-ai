# 🌟 SumScale — Multimodal AI Life-Assistant

> **Reach your data in any format.**
> SumScale is a next-generation Multimodal AI Life-Assistant that understands documents, voice, spreadsheets, and suspicious messages — turning them into instant, actionable real-world decisions.

---

## 🚀 Overview

### The Problem
Every day, individuals and businesses struggle with unorganized, multi-format data:

1. **Medical & Technical Reports** — Complex lab tests and PDFs filled with jargon that non-experts cannot interpret quickly.
2. **Vernacular & Audio Barriers** — Millions of users communicate via regional spoken dialects or voice notes rather than typed text.
3. **Cyber Fraud & Scams** — Increasing prevalence of fake invoices, phishing messages, and impersonation attempts targeting non-technical users.

### The Solution
**SumScale** is a single AI Life Assistant that understands every type of human data — documents, spreadsheets, voice, and images — and turns it into summaries, reminders, protection, and decisions, powered by **Google Gemini Multimodal AI** and **Groq LLaMA 3.3 70B**.

**🔗 Live Demo:** [sum-scale.vercel.app](https://sum-scale.vercel.app)

---

## ✨ Key Capabilities

### 1. 📄 Document Digitisation & Deep Analysis
- Extracts text, tables, key metrics, and structured facts from **PDFs, Scanned Reports, Images, and Financial CSV Datasets**.
- Automated anomaly detection for medical reports, legal contracts, and financial statements.

### 2. 🎙️ Speech & Voice Notes Engine
- Native browser microphone capture (`HTML5 MediaRecorder`) with live waveform visualization.
- Instant multilingual Speech-to-Text transcription and contextual AI summarization.

### 3. 📊 Spreadsheet Intelligence & Calendar Reminders
- Upload large spreadsheets (CSV/XLSX) for instant AI-powered summarization of trends, totals, and key figures.
- Automatically detects deadlines, due dates, and renewal dates buried in the data.
- Sets reminders directly to **Google Calendar** from any detected date, in one click.

### 4. 📅 AI Event Planner
- Automatically detects appointments, deadlines, follow-ups, and important dates from uploaded documents.
- Creates intelligent reminders so users never miss medical appointments, payments, or important meetings.

### 5. 📝 AI Smart Summarizer
- Converts lengthy PDFs, reports, meeting transcripts, and datasets into concise summaries.
- Highlights key findings, risks, action items, and recommendations.

### 6. 🛡️ Fraud & Security Shield
- Scans screenshots and text of suspicious messages, emails, and fake invoices.
- Verifies URLs, phone numbers, domains, and IP addresses using multiple threat-intelligence services, including **VirusTotal**, **Google Safe Browsing**, **IPQualityScore**, and **WhoisXML**.
- Evaluates phishing probability, identifies impersonation patterns, and outputs clear step-by-step remediation advice.

### 7. 📍 Nearby Expert Recommendation
- Detects the type of issue from uploaded documents.
- Recommends nearby hospitals, doctors, pharmacies, service centers, or cybercrime support based on the user's location.

### 8. ⏰ Smart Reminder Engine
- Automatically creates reminders from AI analysis.
- Sends notifications for follow-ups, medicine schedules, payments, and important deadlines.

### 9. 🔊 AI Voice Assistant
- Every AI response is available in both text and speech.
- Supports multilingual voice interaction for improved accessibility.

### 10. 🔑 Secure Email OTP Authentication
- 6-digit verification code sent directly to a user's registered email address — no passwords required.
- Pre-registration check auto-detects user status on login, prompting unregistered users to sign up first.
- Session management via **PyJWT**.

### 11. 🌐 Vernacular Multilingual Support (i18n)
- Native translation toggle supporting **English (US), Hindi (हिंदी), Telugu (తెలుగు), Tamil (தமிழ்), and Kannada (ಕన్నడ)** across all pages and AI responses.

### 12. 💬 Interactive Context-Aware Document Copilot
- Dynamic floating AI assistant capable of answering follow-up queries on uploaded cases in natural, empathetic, multi-paragraph responses.
- Asks intelligent follow-up questions whenever uploaded information is incomplete.

---

## 🛠️ Architecture & Technology Stack

```
                              ┌───────────────────────────────────┐
                              │    React 18 + Vite (Tailwind)     │
                              │     Dual-Theme + i18n Vernacular  │
                              └─────────────────┬─────────────────┘
                                                │ REST API / JSON
                                                ▼
                              ┌───────────────────────────────────┐
                              │      FastAPI Python Backend       │
                              │    (Async Motor + Pydantic v2)    │
                              └────────┬─────────────────┬────────┘
                                       │                 │
           ┌───────────────────────────┴─┐             ┌─┴───────────────────────────┐
           │      AI Engine Layer        │             │  Authentication & Database  │
           │  • Google Gemini 1.5/2.0    │             │  • SMTP Email OTP Transport │
           │  • Groq LLaMA 3.3 70B       │             │  • PyJWT Session Management │
           │  • Google Speech-to-Text    │             │  • MongoDB Atlas Cloud      │
           └─────────────────────────────┘             └─────────────────────────────┘
```

| Layer | Details |
|---|---|
| **Frontend** | **React 18** + **Vite** for lightning-fast page loads, styled with **Tailwind CSS** using a curated Ocean Teal palette (`#006D77`, `#83C5BE`). Includes **i18next** for instant language switching. |
| **Backend** | **FastAPI (Python 3.11)** handles file uploads, user requests, email OTP generation, and securely communicates with MongoDB and AI models asynchronously. |
| **Database** | **MongoDB Atlas** (cloud database) securely storing encrypted user profiles, uploaded case reports, and chat histories. |
| **AI Core** | **Google Gemini SDK** analyzes uploaded PDFs, images, charts, and audio files. **Groq LLaMA 3.3 70B** provides instant, ultra-low-latency real-time chat responses. |
| **Authentication** | Secure 6-digit **Email OTP** verification + **PyJWT** for secure user sessions. |

---

## 📡 API Endpoint Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/send-otp` | Pre-checks user existence & dispatches 6-digit OTP to user's email |
| `POST` | `/api/auth/verify-otp` | Verifies 6-digit OTP code & returns JWT access token |
| `GET` | `/api/auth/me` | Fetches authenticated user profile |
| `POST` | `/api/cases/upload` | Processes uploaded file (PDF/Image/Audio/CSV/XLSX) with Gemini Multimodal AI |
| `GET` | `/api/cases/` | Lists user cases with status & department categorization |
| `GET` | `/api/cases/{id}` | Retrieves detailed analysis report for a specific case |
| `POST` | `/api/reminders/calendar` | Pushes a detected date or deadline to the user's Google Calendar |
| `POST` | `/api/chat/message` | Sends follow-up message to Groq/Gemini AI chatbot |
| `GET` | `/health` | Healthcheck endpoint verifying MongoDB & AI service connections |

---

## 💻 Local Quickstart Guide

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **MongoDB Atlas** or local MongoDB instance

### 1. Clone & Configure Environment
```bash
git clone https://github.com/shankss-18/SumScale.git
cd SumScale
```

Create a `backend/.env` file:
```ini
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
SPEECH_TO_TEXT_API_KEY=your_speech_key
GOOGLE_PLACES_API_KEY=your_places_key
GOOGLE_CALENDAR_CLIENT_ID=your_calendar_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_calendar_client_secret
MONGODB_URL=your_mongodb_connection_string
MONGODB_DB_NAME=omniaid
JWT_SECRET_KEY=your_64_char_random_jwt_secret
FRONTEND_URL=http://localhost:5173
ENVIRONMENT=development
LOG_LEVEL=INFO
PORT=8000
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
```

### 2. Start the Backend Server
```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend runs on `http://localhost:8000` (API docs available at `http://localhost:8000/docs`)*

### 3. Start the Frontend App
```bash
cd ../frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`*

---

## 🗺️ Roadmap

### 🔮 Upcoming Features

- **Trust Circle** — Users will be able to add trusted contacts (friends/family) and, with one click, share an AI-generated risk alert summary directly from a case's chat conversation — e.g. instantly warning a family member about a detected fraud attempt or health risk flagged in their own case. Alerts will be scoped to only the specific AI response shared, never raw uploaded evidence, keeping the same per-user/per-case data isolation already enforced elsewhere in the app.

---

## 🌐 Live Cloud Deployment

- **Frontend Hosting**: [Vercel](https://sum-scale.vercel.app) (`frontend` root directory, Vite preset, `VITE_API_BASE_URL` env variable)
- **Backend Hosting**: **Render Web Service** (Python 3.11 environment, `backend` root directory, `uvicorn main:app --host 0.0.0.0 --port $PORT`)
- **Database**: **MongoDB Atlas** (IP access `0.0.0.0/0` enabled for cloud service instances)

---

## 🏆 Impact

- ⚡ Multimodal AI across Documents, Spreadsheets, Images, Audio & Text
- 🌍 5-language conversational support
- 📝 AI-powered document & spreadsheet summarization
- 📅 Automatic reminder generation, synced to Google Calendar
- 📍 Nearby expert recommendations based on location
- 🛡️ Fraud verification using multiple threat-intelligence APIs
- 🔊 Voice + text AI responses
- 🔒 Secure Email OTP authentication
- 📂 Multiple document and data formats supported
- 🤖 Context-aware conversational AI

---

## 🎯 Vision

To build a single AI Life Assistant that understands every type of human data, provides trustworthy recommendations, protects users from fraud, remembers important events, and helps people make better decisions through natural conversations.

---

## 📄 License
All rights reserved by **Team SumScale**.
