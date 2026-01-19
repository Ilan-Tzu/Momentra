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

### Intelligent Conflict Management
- **Real-time conflict detection**: Knows when you're double-booked before you save
- **Smart resolution UI**: Clear visual comparison of conflicting tasks
- **Flexible override**: Force-save when you need to (with a warning system)
- **Recursive conflict checking**: Handles cascading schedule changes

### Premium User Experience
- **Glassmorphism design**: Modern, elegant UI with blur effects and gradients
- **Smooth interactions**: Animated calendar strip with auto-centering on selected dates
- **Inline editing**: Click to edit tasks directly on the calendar
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
- **Auth**: Google OAuth token verification

### AI Integration
- **LLM**: GPT-4o-mini with structured output (JSON schema)
- **Voice**: Whisper-1 for transcription
- **Prompt Engineering**: 
  - Timezone-aware parsing
  - Ambiguity detection
  - Conflict-free scheduling recommendations
  - Natural language understanding for relative dates ("tomorrow", "next Friday")

---

## 🚀 Current Feature Set

### ✅ Implemented
- [x] Natural language task creation
- [x] Voice input with transcription
- [x] Google Sign-In authentication
- [x] Timezone-aware UTC conversion
- [x] **Premium Amber-Gold Conflict Resolution UI**
  - [x] Vertical task stack for clear comparison
  - [x] "Save Anyway" override with pulse animation
  - [x] Strict time validation (End > Start)
- [x] **Unified Event Editing**
  - [x] Glassmorphic modal for both tasks and candidates
  - [x] Split date/time inputs with adjustment arrows
  - [x] Duration persistence logic
- [x] Time ambiguity handling (AM/PM clarification)
- [x] Calendar strip visualization (30-day view)
- [x] Task dots indicator (up to 3 per day)
- [x] Smooth scrolling calendar navigation
- [x] Glassmorphism UI design
- [x] **Vibrant Login Page**
  - [x] "Zen" drift animation with motion trails
  - [x] Elastic block physics
  - [x] Deep gradient aesthetics
- [x] **Standardized Environment Configuration**
  - [x] Backend: Centralized `pydantic-settings` with type safety
  - [x] Frontend: Vite environment modes (.env.development / .env.production)
  - [x] Secure Google OAuth client ID handling
- [x] **Comprehensive Testing Infrastructure**
  - [x] Backend: `pytest` with async support and database fixtures
  - [x] Backend: AI prompt logic validation using mocks
  - [x] Frontend: `Vitest` + React Testing Library (modern Jest alternative)
  - [x] E2E: `Playwright` integration for resilient UI testing

### 🔧 Core Components
- **LoginPage**: Google OAuth with floating calendar animations
- **Navbar**: App navigation and logout
- **CalendarStrip**: Horizontal date selector with task indicators
- **Task Management**: Create, read, update, delete operations
- **EditEventModal**: Unified interface for editing tasks and preview candidates
- **ConflictModal**: High-gravity visual conflict resolution interface
- **PreviewModal**: LLM-generated task review before acceptance

---

## 📋 Next Steps (Roadmap to MVP)

### High Priority
1. **Mobile Responsiveness**
   - Adaptive calendar layout
   - Touch-friendly interactions
   - PWA capabilities

2. **Calendar Integration**
   - Google Calendar sync (two-way)
   - webcal export/import

### Medium Priority
3. **Recurring Tasks**
   - Daily/weekly/monthly patterns
   - Custom recurrence rules
   - Smart handling of conflicts

4. **Notifications & Reminders**
   - Email notifications
   - Browser push notifications
   - Customizable reminder times

5. **User Preferences**
   - Default task duration
   - Work hours
   - Timezone selection
   - Theme customization

6. **Enhanced AI Features**
    - Task prioritization suggestions
    - Smart scheduling (find best time slot)
    - Meeting preparation summaries
    - Context-aware task grouping

### Lower Priority
7. **Search & Filter**
    - Full-text task search
    - Date range filtering
    - Tag-based organization

8. **Analytics Dashboard**
    - Time tracking
    - Productivity insights
    - Task completion rates

9. **Collaboration**
    - Shared calendars
    - Team scheduling
    - Meeting polls

10. **API Rate Limiting & Caching**
    - OpenAI cost optimization
    - Request throttling
    - Response caching for common queries

---

## 🏁 Distance from Production

### Current Status: **Alpha (60% Production-Ready)**

#### What's Production-Ready ✅
- Core scheduling logic
- AI parsing with timezone handling
- Google OAuth authentication
- Conflict detection algorithm
- UTC conversion system
- Frontend UI/UX foundation
- Database Schema (PostgreSQL + Alembic)
- Error Handling & Logging
- **Standardized Multi-Environment Configuration**
- **Comprehensive Testing Suite (AI, API, UI)**

#### Critical Gaps 🚧
- **Infrastructure** (4/10)
  - Production database setup (PostgreSQL ready) ✅
  - Multi-env Config (Dev/Prod) ✅
  - No deployment configuration (Docker/K8s) ❌
  - No CI/CD pipeline ❌
  - No monitoring/alerting ❌

- **Security** (3/10)
  - Google OAuth ✅
  - API keys in .env ⚠️ (needs secrets manager)
  - No rate limiting ❌
  - No input sanitization ❌
  - No HTTPS enforcement ❌

- **Reliability** (4/10)
  - Comprehensive Error Handling ✅
  - No retry logic ❌
  - No backup system ❌
  - No data validation (beyond Pydantic) ⚠️

- **Testing** (6/10)
  - Unit tests (Backend ✅, Frontend ⚠️)
  - AI Prompt Logic ✅
  - No integration tests ❌
  - E2E tests (Infrastructure ✅, Coverage ❌)

- **Documentation** (2/10)
  - README ✅
  - API Documentation (Swagger/Redoc) ✅
  - No user guide ❌

#### Estimated Timeline to MVP
- **2-3 weeks** for basic production deployment
  - Week 1: Testing foundation, Environment config
  - Week 2: Security hardening, deployment setup, monitoring
  - Week 3: Bug fixes, polish, documentation

- **4-6 weeks** for feature-complete MVP
  - Includes recurrence, notifications, calendar sync

- **8-12 weeks** for market-ready product
  - Includes mobile apps, team features, analytics

---

## 💡 Unique Selling Points

1. **Zero Learning Curve**: No buttons to learn, just type or speak naturally
2. **Intelligent Ambiguity Handling**: Doesn't just fail—asks smart clarifying questions
3. **Timezone-Native**: Built for global users from day one
4. **Conflict Prevention, Not Just Detection**: Warns you before you make scheduling mistakes
5. **Voice-First Design**: Transcription isn't an afterthought—it's core to the UX
6. **Premium Aesthetics**: Glassmorphism design that feels like a professional tool

---

## 🔐 Environment Setup

### Required API Keys
```bash
# Backend (.env in /backend)
OPENAI_API_KEY=sk-proj-...

# Frontend (.env in /frontend)
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials (Web application)
3. Add authorized origins:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`

---

## 📊 Current Metrics

- **Lines of Code**: ~9,800
- **API Endpoints**: 16
- **AI Token Usage**: ~200-500 tokens per task creation
- **Supported Features**: 25+ core features
- **Database Tables**: 4 (Users, Jobs, JobCandidates, Tasks)

---

## 🎯 Vision

Momentra aims to be the **Siri of calendars**—an AI assistant that understands the nuances of time, respects your preferences, and handles scheduling complexity so you can focus on what matters.

**Long-term goal**: A calendar that schedules itself, using AI to optimize your time, suggest better meeting times, and automatically handle the tedious parts of time management.

---

## 🤝 Contributing

This is currently a private project. For questions or collaboration inquiries, contact the project owner.

---

## 📜 License

Private - All Rights Reserved

---

**Last Updated**: January 19, 2026  
**Version**: 0.3.0-alpha
