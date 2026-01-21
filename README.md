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
- **Ambiguity resolution**: If you say "meeting at 8" without AM/PM, Momentra asks for clarification
- **Stay-aware**: Recognizes "Airbnb", "Hotel", or "Stay" and automatically prompts for check-in/out times with educated guesses (3pm/11am)

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
- **Modular Themes**: Specialized skins for Edit (Cyber-Industrial), Conflict (Amber/Warning), and Review (Purple Glass) modes
- **Google Sign-In**: Seamless authentication with OAuth 2.0

---

## 🛠️ Technical Architecture

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Custom CSS with glassmorphism design system
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
- **Voice**: Whisper-1 for transcription
- **Prompt Engineering**: 
  - Timezone-aware parsing
  - Ambiguity detection
  - Conflict-free scheduling recommendations
  - Stay ambiguity detection for accommodations (Airbnb/Hotels)
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
  - [x] **Persistence**: Synced across sessions via dedicated backend storage
- [x] **Intelligent Conflict Resolution**
  - [x] **Smart Suggested Slots**: Automatically finds the nearest free gap respecting buffer and work hours
  - [x] **Amber-Gold Conflict UI**: Vertical task stack for clear comparison
  - [x] "Save Anyway" override with pulse animation
- **[x] Multi-Day Task Visualization**
  - [x] **Proportional Bars**: Bar length and position now reflect exact hours
  - [x] **Vertical Connectors**: Task list shows "Start", "Continued", and "End" segments with visual links
- [x] **Non-Blocking Task Support**
  - [x] Logistical Bypass: "Airbnb", "Stay", and "Hotel" events are non-blocking
  - [x] Rigid Enforcement: "Flights" and "Appointments" remain blocking
- [x] **Stay Ambiguity Handling**
  - [x] Automatic detection of accommodation keywords
  - [x] "Educated Guess" options (Check-in 3pm / Check-out 11am)
- [x] **Unified Event Editing**
  - [x] Cyber-Industrial Theme Modal
  - [x] Auto-Follow Logic: Portal jumps to the new date after rescheduling
- [x] **Mobile Responsiveness & PWA**
  - [x] Adaptive layouts & PWA manifest
  - [x] Notch-safe design for modern devices
- [x] **Security & Performance**
  - [x] Rate limiting & LLM/Transcription caching
  - [x] JWT with auto-background token refresh
  - [x] Input sanitization with `bleach`

### 🔧 Core Components
- **LoginPage**: Google OAuth with floating calendar animations
- **Navbar**: App navigation and logout
- **CalendarStrip**: Horizontal date selector with multi-lane task indicators
- **PreferencesPage**: Tabbed settings (Scheduling, AI, Display) with debounced auto-save
- **ConflictModal**: High-gravity visual conflict resolution interface
- **PreviewModal**: LLM-generated task review before acceptance

---

## 📋 Next Steps (Roadmap to MVP)

### High Priority
1. **Calendar Integration**
   - Google Calendar sync (two-way)
   - webcal export/import

### Medium Priority
2. **Recurring Tasks**
   - Daily/weekly/monthly patterns
   - Custom recurrence rules
   - Smart handling of conflicts

4. **Notifications & Reminders**
   - Email notifications
   - Browser push notifications
   - Customizable reminder times

3. **Templates**
   - Create templates for recurring patterns (Gym Day, Work Day, etc.)
   - Mass removal/insertion of template-driven events

### Lower Priority
7. **Search & Filter**
    - Full-text task search
    - Date range filtering
    - Tag-based organization

8. **Analytics Dashboard**
    - Time tracking & productivity insights

8. **Collaboration**
    - Shared calendars & Team scheduling


---

## 🏁 Distance from Production

### Current Status: **Alpha (85% Production-Ready)**

#### What's Production-Ready ✅
- Core scheduling & AI parsing logic
- Complex conflict detection & smart fix engine
- User preference system (Scheduling + AI Context)
- Google OAuth & JWT refresh mechanism
- PWA & Mobile support
- Testing suite (AI, API, UI)
- Security Hardening

#### Critical Gaps 🚧
- **Infrastructure** (5/10)
  - No deployment configuration (Docker/K8s) ❌
  - No CI/CD pipeline ❌
  - No monitoring/alerting ❌

- **Reliability** (6/10)
  - No automated backup system ❌
  - Basic data validation (needs more rigid constraints) ⚠️

- **Testing** (8/10)
  - Integration tests ❌
  - Coverage needs expanding for edge case conflict chains ⚠️

- **Documentation** (3/10)
  - API Documentation (Swagger) ✅
  - Technical architecture notes ✅
  - No end-user manual ❌

#### Estimated Timeline to MVP
- **2-3 weeks** for basic production deployment
  - Week 1: Infrastructure as Code, CI/CD setup
  - Week 2: Reliability hardening & monitoring
  - Week 3: Bug fixes, polish, documentation

- **4-6 weeks** for feature-complete MVP
  - Includes recurrence, notifications, calendar sync

---

## 💡 Unique Selling Points

1. **Zero Learning Curve**: No buttons to learn, just type or speak naturally.
2. **Context-Aware Scheduling**: The AI knows your habits, work hours, and preferred buffers.
3. **Smart Fixes, Not Just Warnings**: One-tap resolution for scheduling conflicts.
4. **Timezone-Native**: Built for global users from day one.
5. **Premium Aesthetics**: Glassmorphism design that feels high-end and professional.

---

## 🔐 Configuration & Secrets Management

Momentra uses a multi-layered configuration strategy to ensure security and ease of deployment.

### 1. Configuration Hierarchy (Backend)
The backend uses `Pydantic Settings` which follows this order of priority:
1. **Environment Variables**: Set directly on the host (Highest priority, recommended for Production).
2. **.env File**: Local file (Only loaded in `development` mode).
3. **Defaults**: Hardcoded values in `app/config.py`.

### 2. Environment Setup
To set up your environment:
1. Copy `backend/.env.example` to `backend/.env`.
2. Copy `frontend/.env.example` to `frontend/.env`.
3. Add your sensitive keys (`OPENAI_API_KEY`, etc.) to the `.env` files.
4. **DO NOT commit `.env` files.** The root `.gitignore` is configured to protect them.

### 🔑 Required API Keys
```bash
# Backend
OPENAI_API_KEY=sk-proj-...
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
JWT_SECRET_KEY=... # 32+ character random string

# Frontend
VITE_API_BASE_URL=https://api.yourdomain.com/v1
VITE_GOOGLE_CLIENT_ID=...
```

---

## 📊 Current Metrics

- **Lines of Code**: ~13,500
- **API Endpoints**: 19
- **AI Token Usage**: ~300-600 tokens per task creation (context-enriched)
- **Supported Features**: 30+ core features
- **Database Tables**: 5 (Users, Jobs, JobCandidates, Tasks, UserPreferences)

---

## 🎯 Vision

Momentra aims to be the **Siri of calendars**—an AI assistant that understands the nuances of time, respects your personal lifestyle, and handles scheduling complexity so you can focus on what matters.

---

## 📜 License

Private - All Rights Reserved

---

**Last Updated**: January 21, 2026  
**Version**: 0.9.0-alpha
