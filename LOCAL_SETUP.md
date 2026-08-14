# SumScale 2.0 — Local Development Setup Guide

Everything you need to run the project entirely on **localhost** with a **fresh database**.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| MongoDB | 7.0+ | [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community) |

---

## Step 1 — Start MongoDB Locally

### Option A: Local MongoDB (Recommended — no account needed)

1. Install MongoDB Community Edition from the link above
2. Start the service:
   ```powershell
   # Windows (after installation)
   net start MongoDB
   ```
3. Verify it's running:
   ```powershell
   mongosh --eval "db.runCommand({ping:1})"
   ```

Your `MONGODB_URL` in `backend/.env` is already set to `mongodb://localhost:27017`.  
The database **`sumscale_local`** will be created automatically on first use — no manual setup needed.

### Option B: MongoDB Atlas (Free cloud tier)

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas/database)
2. Create a **Free M0** cluster
3. Get your connection string and update `backend/.env`:
   ```
   MONGODB_URL=mongodb+srv://<username>:<password>@cluster0.example.net
   MONGODB_DB_NAME=sumscale_local
   ```

---

## Step 2 — Get Your API Keys

### Required (app won't start without these)

#### Gemini API Key (FREE)
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API key**
3. Add to `backend/.env`:
   ```
   GEMINI_API_KEY=<your_gemini_api_key_here>
   ```

### Recommended

#### Groq API Key (FREE — 14,400 requests/day)
1. Go to [console.groq.com](https://console.groq.com)
2. Create an account → **API Keys** → **Create API Key**
3. Add to `backend/.env`:
   ```
   GROQ_API_KEY=<your_groq_api_key_here>
   ```

### For OTP Email Authentication (pick one)

#### Option A: Brevo (FREE — 300 emails/day, easiest)
1. Sign up at [app.brevo.com](https://app.brevo.com/account/register)
2. Go to **SMTP & API → API Keys**
3. Add to `backend/.env`:
   ```
   BREVO_API_KEY=<your_brevo_api_key_here>
   ```

#### Option B: Gmail App Password
1. Enable 2FA on your Google account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Generate an App Password for "Mail"
4. Add to `backend/.env`:
   ```
   SMTP_USER=your_gmail@gmail.com
   SMTP_PASSWORD=xxxx xxxx xxxx xxxx
   SMTP_FROM_EMAIL=your_gmail@gmail.com
   ```

---

## Step 3 — Backend Setup

```powershell
# Navigate to backend directory
cd d:\sumscale-2.0\backend

# Activate the virtual environment (already created)
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn main:app --reload --port 8000
```

The backend will start at **http://localhost:8000**  
Swagger API docs: **http://localhost:8000/docs**

> If you see a startup error about a missing env var, check `backend/.env` and fill in the required values.

---

## Step 4 — Frontend Setup

Open a **new terminal**:

```powershell
# Navigate to frontend directory
cd d:\sumscale-2.0\frontend

# Install dependencies (first time only)
npm install

# Start the dev server
npm run dev
```

The frontend will start at **http://localhost:5173**

---

## Step 5 — Verify Everything Works

1. Open **http://localhost:5173** — you should see the SumScale landing page
2. Open **http://localhost:8000/docs** — you should see the FastAPI Swagger UI
3. Click **Sign Up** → enter your email → you'll receive an OTP email (if email is configured)
4. Create a new case → upload a file → it should analyze with Gemini/Groq

---

## Project Structure

```
sumscale-2.0/
├── backend/                 # FastAPI server
│   ├── .env                 # ← YOUR LOCAL CONFIG (fill this in)
│   ├── .venv/               # Python virtual environment
│   ├── main.py              # App entry point
│   ├── requirements.txt     # Python dependencies
│   └── app/
│       ├── config.py        # Settings loaded from .env
│       ├── routers/         # API route handlers
│       ├── services/        # Business logic (AI, fraud, chat, etc.)
│       ├── models/          # MongoDB document models
│       ├── schemas/         # Pydantic request/response schemas
│       └── utils/           # Auth, logging, rate limiting
├── frontend/                # React + Vite app
│   ├── .env                 # ← FRONTEND LOCAL CONFIG
│   ├── package.json
│   ├── vite.config.js       # Dev proxy: /api → localhost:8000
│   └── src/
│       ├── App.jsx          # Router + providers
│       ├── api/client.js    # Axios API client
│       ├── pages/           # Page components
│       ├── components/      # Shared UI components
│       └── context/         # Auth context
└── LOCAL_SETUP.md           # ← This file
```

---

## Database: `sumscale_local`

The new database `sumscale_local` is completely fresh — no existing data.

Collections created automatically on first use:
| Collection | Purpose |
|-----------|---------|
| `users` | User accounts |
| `cases` | AI analysis cases |
| `otp_verifications` | Email OTP tokens |
| `reminders` | Case reminders |
| `fraud_checks_cache` | 24-hour fraud result cache |
| `shared_intel` | Community fraud reports |
| `alerts_sent` | SMS alert audit log |

---

## Troubleshooting

### Backend won't start
- Check all required keys are set in `backend/.env`
- Make sure MongoDB is running: `mongosh --eval "db.ping()"`
- Check Python version: `python --version` (need 3.11+)

### Frontend can't reach backend
- Make sure backend is running on port 8000
- The Vite proxy (`/api → localhost:8000`) handles all API calls automatically

### No OTP email received
- Check spam/junk folder
- Verify `BREVO_API_KEY` or `SMTP_USER`/`SMTP_PASSWORD` are set correctly
- In development, OTP is logged to the backend console if email fails

### File upload / AI analysis fails
- Verify `GEMINI_API_KEY` is valid and not a placeholder
- Check backend console logs for the specific error

---

## Minimum Config to Start (copy-paste ready)

Fill just these 2 fields in `backend/.env` and everything else works:

```env
GEMINI_API_KEY=    ← paste your Gemini key here
MONGODB_URL=mongodb://localhost:27017   ← already set
```

The JWT secret is already auto-generated. Groq and email are optional for basic testing.
