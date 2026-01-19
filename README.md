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
- **Database**: SQLite (development)
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
- [x] Conflict detection and resolution UI
- [x] Time ambiguity handling (AM/PM clarification)
- [x] Inline task editing on calendar
- [x] Calendar strip visualization (30-day view)
- [x] Task dots indicator (up to 3 per day)
- [x] Smooth scrolling calendar navigation
- [x] Glassmorphism UI design
- [x] Auto-centering on selected date
- [x] Edit box auto-close after conflict resolution
- [x] Force-save with "Save Anyway" for conflicts

### 🔧 Core Components
- **LoginPage**: Google OAuth with floating calendar animations
- **Navbar**: App navigation and logout
- **CalendarStrip**: Horizontal date selector with task indicators
- **Task Management**: Create, read, update, delete operations
- **Conflict Modal**: Visual conflict resolution interface
- **Preview Modal**: LLM-generated task review before acceptance

---

## 📋 Next Steps (Roadmap to MVP)

### High Priority
1. **Database Migration System**
   - Replace SQLite deletion with Alembic migrations
   - Handle schema changes gracefully
   
2. **Error Handling & Logging**
   - Comprehensive error boundaries
   - Backend logging with proper levels
   - User-friendly error messages

3. **Environment Configuration**
   - Proper .env management for production
   - Secrets management (API keys, OAuth)
   - Multi-environment support (dev/staging/prod)

4. **Testing**
   - Frontend: Jest + React Testing Library
   - Backend: pytest
   - E2E: Playwright or Cypress
   - AI prompt testing

5. **Mobile Responsiveness**
   - Adaptive calendar layout
   - Touch-friendly interactions
   - PWA capabilities

### Medium Priority
6. **Calendar Integration**
   - Google Calendar sync (two-way)
   - iCal export/import
   - Outlook integration

7. **Recurring Tasks**
   - Daily/weekly/monthly patterns
   - Custom recurrence rules
   - Smart handling of conflicts

8. **Notifications & Reminders**
   - Email notifications
   - Browser push notifications
   - Customizable reminder times

9. **User Preferences**
   - Default task duration
   - Work hours
   - Timezone selection
   - Theme customization

10. **Enhanced AI Features**
    - Task prioritization suggestions
    - Smart scheduling (find best time slot)
    - Meeting preparation summaries
    - Context-aware task grouping

### Lower Priority
11. **Search & Filter**
    - Full-text task search
    - Date range filtering
    - Tag-based organization

12. **Analytics Dashboard**
    - Time tracking
    - Productivity insights
    - Task completion rates

13. **Collaboration**
    - Shared calendars
    - Team scheduling
    - Meeting polls

14. **API Rate Limiting & Caching**
    - OpenAI cost optimization
    - Request throttling
    - Response caching for common queries

---

## 🏁 Distance from Production

### Current Status: **Alpha (30% Production-Ready)**

#### What's Production-Ready ✅
- Core scheduling logic
- AI parsing with timezone handling
- Google OAuth authentication
- Conflict detection algorithm
- UTC conversion system
- Frontend UI/UX foundation

#### Critical Gaps 🚧
- **Infrastructure** (0/10)
  - No production database (PostgreSQL needed)
  - No deployment configuration (Docker/K8s)
  - No CI/CD pipeline
  - No monitoring/alerting

- **Security** (3/10)
  - Google OAuth ✅
  - API keys in .env ⚠️ (needs secrets manager)
  - No rate limiting ❌
  - No input sanitization ❌
  - No HTTPS enforcement ❌

- **Reliability** (2/10)
  - Basic error handling ⚠️
  - No retry logic ❌
  - No backup system ❌
  - No data validation ❌

- **Testing** (0/10)
  - No unit tests ❌
  - No integration tests ❌
  - No E2E tests ❌

- **Documentation** (1/10)
  - README ✅
  - No API documentation ❌
  - No user guide ❌

#### Estimated Timeline to MVP
- **2-3 weeks** for basic production deployment
  - Week 1: Database migration, error handling, testing foundation
  - Week 2: Security hardening, deployment setup, monitoring
  - Week 3: Bug fixes, polish, documentation

- **4-6 weeks** for feature-complete MVP
  - Includes recurring tasks, notifications, calendar sync

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

- **Lines of Code**: ~8,000
- **API Endpoints**: 14
- **AI Token Usage**: ~200-500 tokens per task creation
- **Supported Features**: 15+ core features
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
**Version**: 0.1.0-alpha
