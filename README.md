# Momentra

> **An AI-powered calendar assistant that understands natural language and handles your schedule intelligently.**

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-Private-red)]()

---

## 🌟 What Makes Momentra Unique

Momentra isn't just another calendar app—it's your intelligent scheduling companion that understands human language and handles the complexity of time management for you.

### Core Innovation: Natural Language Scheduling
- **Say what you want, when you want it**: "Workout at 4pm tomorrow" → Task created
- **Voice input**: Speak naturally, Momentra transcribes and schedules
- **Timezone-aware**: Automatically converts between your local time and UTC
- **Ambiguity resolution**: If you say "meeting at 8" without AM/PM, Momentra asks for clarification (now locally resolved!)
- **Stay-aware**: Recognizes "Airbnb", "Hotel", or "Stay" and automatically prompts for check-in/out times with educated guesses (3pm/11am)
- **Hybrid Parsing Architecture**: Uses a local regex-based "Fast Path" to resolve simple tasks instantly (~10ms) without hitting the AI, saving cost and latency.

### Intelligent Conflict Management
- **Real-time conflict detection**: Knows when you're double-booked before you save
- **Smart Fix Suggestions**: One-click "Suggested Time" slot finding based on your buffer and work hours
- **Recursive conflict checking**: Handles cascading schedule changes
- **Non-Blocking Logic**: Intelligently distinguishes between logistical backdrops (Airbnb, Hotels) and rigid commitments (Flights, Meetings)

### Personalized AI Intelligence
- **Deep Personal Context**: Tell the AI who you are and how you work (e.g. "I'm a morning person", "I travel often") to influence scheduling decisions
- **Customizable AI Behavior**: Adjust AI temperature/creativity and specify personal rules
- **Scheduling Discipline**: Fine-tune buffer times, default event durations, and working hours

### Premium User Experience
- **Glassmorphism design**: Modern, elegant UI with blur effects and gradients
- **Dual-Mode UI**: Seamlessly switch between focus-driven Modal views and comprehensive Full-Page dashboards
- **Smooth interactions**: Animated calendar strip with auto-centering on selected dates
- **Modular Themes**: Specialized skins for Edit (Cyber-Industrial), Conflict (Amber/Warning), Review (Purple Glass), and **Templates (Vibrant Orange/Amber)**
- **Google Sign-In**: Seamless authentication with OAuth 2.0

---

## 🛠️ Technical Architecture

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Custom CSS with glassmorphism design system
- **Icons**: Lucide React
- **State Management**: React hooks
- **HTTP Client**: Axios
- **Auth**: @react-oauth/google

### Backend
- **Framework**: FastAPI (Python 3.12)
- **ORM**: SQLAlchemy
- **Database**: PostgreSQL (via Alembic migrations)
- **AI**: OpenAI GPT-4o-mini + Whisper
- **Auth**: JWT (JSON Web Tokens) with Google OAuth 2.0

### AI Integration
- **LLM**: GPT-4o-mini with structured output (JSON schema)
- **Local Fast-Path**: Custom RegEx/DateUtil parser that handles 70-80% of routine schedule inputs with **0 cost** and **~10ms latency**
- **Voice**: Whisper-1 for transcription
- **Prompt Engineering**: 
  - Timezone-aware parsing
  - Ambiguity detection
  - Conflict-free scheduling recommendations
  - **Lodging Intelligence**: Specialized defaults for Airbnb/Hotels (15:00 Check-in, 11:00 Check-out)
  - Natural language understanding for relative dates ("tomorrow", "next Friday")

---

## 🚀 Current Feature Set

### ✅ Implemented
- [x] Natural language task creation
- [x] Voice input with transcription
- [x] Google Sign-In authentication
- [x] Timezone-aware UTC conversion
- [x] **Smart User Preferences System**
  - [x] **Scheduling**: Custom buffer times, work hours, and default durations
  - [x] **AI Behavior**: Adjustable temperature and free-form personal context
  - [x] **Display**: 24h/12h time format and First Day of Week settings
- [x] **Intelligent Conflict Resolution**
  - [x] **Smart Suggested Slots**: Automatically finds the nearest free gap respecting buffer and work hours
  - [x] **Amber-Gold Conflict UI**: Vertical task stack for clear comparison
  - [x] "Save Anyway" override with pulse animation
- **[x] Stock Templates Library**
  - [x] **Vibrant Orange Theme**: Distinct visual identity for templated scheduling
  - [x] **6 Pro-Grade Templates**: Productive Morning, Fitness Day, Meal Prep, Wind-down, Focus Block, Errand Runner.
  - [x] **One-Click Implementation**: Seamlessly populates the prompt field from templates
- **[x] Multi-Day Task Visualization**
  - [x] **Proportional Bars**: Bar length and position now reflect exact hours
  - [x] **Vertical Connectors**: Task list shows "Start", "Continued", and "End" segments with visual links
  - [x] **Review Context**: Date ranges (e.g., Nov 12 - 14) displayed during confirmation
- [x] **Non-Blocking Task Support**
  - [x] Logistical Bypass: "Airbnb", "Stay", and "Hotel" events are non-blocking
  - [x] Rigid Enforcement: "Flights" and "Appointments" remain blocking
- [x] **Stay Ambiguity Handling**
  - [x] Automatic detection of accommodation keywords
  - [x] "Educated Guess" options (Check-in 3pm / Check-out 11am)
  - [x] **Lodging Defaults**: Automatic 15:00/11:00 times for Airbnb/Hotels
- [x] **Enhanced Event Review**
  - [x] **Standardized Action UI**: 14px rounded buttons with semantic icons (Accept, Reject, Edit)
  - [x] **Clean Multi-Day Logic**: Range-based display for events spanning multiple days
- [x] **Unified Event Editing**
  - [x] Cyber-Industrial Theme Modal
  - [x] Auto-Follow Logic: Portal jumps to the new date after rescheduling
- [x] **Mobile Responsiveness & PWA**
  - [x] Adaptive layouts & PWA manifest
  - [x] Notch-safe design for modern devices
- [x] **Token Usage & Cost Tracking**
  - [x] Per-user & per-feature spend monitoring
  - [x] Exact token split (Input vs. Output)
  - [x] **Hybrid Logging**: Locally parsed tasks are logged as $0.00 cost events
  - [x] Real-time cost calculation (USD) & latency logging
- [x] **Admin Dashboard (SQLAdmin)**
  - [x] Live analytics overview (Cards + Usage Graphs)
  - [x] **Usage Breakdown Table**: Visual split between local parsing and AI calls
  - [x] **Local Parser Badges**: Green visual indicators for "free" local executions
  - [x] Deep inspection of Users, Tasks, AI Jobs, and Token Logs
- [x] **Security & Performance**
  - [x] Rate limiting & LLM/Transcription caching
  - [x] JWT with auto-background token refresh
  - [x] Input sanitization with `bleach`

---

## 🏁 Distance from Production

### Current Status: **Alpha (90% Production-Ready)**

#### What's Production-Ready ✅
- Core scheduling & AI parsing logic
- Complex conflict detection & smart fix engine
- User preference system & Stock Templates
- Google OAuth & JWT refresh mechanism
- PWA & Mobile support
- Testing suite & Security Hardening
- Token tracking & Costs

#### Critical Gaps 🚧
- **Infrastructure** (7/10)
  - Deployment configuration (Docker) in progress ❌
  - CI/CD pipeline ❌

- **Testing** (8/10)
  - Integration tests for edge case conflict chains ⚠️

- **Documentation** (5/10)
  - API Documentation (Swagger) ✅
  - Technical architecture notes ✅
  - No end-user manual ❌

---

## 📊 Current Metrics

- **Lines of Code**: ~16,200
- **API Endpoints**: 22
- **AI Token Usage**: ~300-600 tokens per task creation
- **Parsing Latency**: ~10ms (Local) / ~1.5s (AI)
- **Supported Features**: 50+ core features
- **Database Tables**: 6 (Users, Jobs, JobCandidates, Tasks, UserPreferences, TokenLogs)

---

## 💡 Unique Selling Points

1. **Zero Learning Curve**: No buttons to learn, just type or speak naturally.
2. **Context-Aware Scheduling**: The AI knows your habits, work hours, and preferred buffers.
3. **Smart Fixes, Not Just Warnings**: One-tap resolution for scheduling conflicts.
4. **Timezone-Native**: Built for global users from day one.
5. **Premium Aesthetics**: Glassmorphism design that feels high-end and professional.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.12+
- PostgreSQL (or use the default SQLite for dev)

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# On macOS/Linux:
source .venv/bin/activate  
# On Windows:
# .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
uvicorn app.main:app --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### 3. Access
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🎯 Vision

Momentra aims to be the **Siri of calendars**—an AI assistant that understands the nuances of time, respects your personal lifestyle, and handles scheduling complexity so you can focus on what matters.

---

## 📜 License

Private - All Rights Reserved

---

**Last Updated**: February 18, 2026  
**Version**: 0.9.7-alpha
