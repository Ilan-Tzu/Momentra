# Momentra: Pre-Native App Checklist

**Goal**: Prepare the web app for native mobile wrapping (Capacitor/React Native)  
**Timeline**: 1-2 weeks  
**Current Status**: 75% Production-Ready → Target: 90% Production-Ready

---

## 🚨 CRITICAL (Must Complete Before Wrapping)

### 1. JWT Authentication & Session Management
**Priority**: 🔴 CRITICAL | **Effort**: Medium (1 day) | **Status**: ✅ COMPLETED

**Backend Tasks**:
- [x] Install `PyJWT` and `python-jose` for token generation
- [x] Create `/api/v1/auth/token` endpoint (returns access + refresh tokens)
- [x] Implement JWT token generation with expiration (access: 15min, refresh: 7 days)
- [x] Create `/api/v1/auth/refresh` endpoint for token renewal
- [x] Add JWT middleware/dependency to validate tokens on protected routes
- [x] Update Google OAuth flow to return JWT tokens

**Frontend Tasks**:
- [x] Update `LoginPage.jsx` to store JWT tokens (access + refresh)
- [x] Create `auth.js` utility for token management
- [x] Implement automatic token refresh before expiration
- [x] Add token to all API requests via Axios interceptor
- [x] Handle 401 responses (redirect to login)
- [x] Secure token storage (localStorage with auth abstraction)

**Acceptance Criteria**:
- ✅ User stays logged in after page refresh
- ✅ Tokens auto-refresh before expiration
- ✅ Invalid tokens redirect to login
- ✅ All API calls include valid JWT

---

### 2. Offline Mode & Network Handling
**Priority**: 🔴 CRITICAL | **Effort**: Medium (1 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Add network status detection (`navigator.onLine`)
- [ ] Create `<OfflineBanner>` component (shows when disconnected)
- [ ] Implement request queue for failed API calls
- [ ] Add retry logic with exponential backoff
- [ ] Store critical data in IndexedDB for offline access
- [ ] Show cached data with "offline" indicator
- [ ] Sync queued requests when connection restored

**Acceptance Criteria**:
- ✅ App shows clear "offline" indicator
- ✅ Failed requests are queued and retried
- ✅ Users can view cached calendar data offline
- ✅ Changes sync automatically when back online

---

### 3. Loading States & Skeleton Screens
**Priority**: 🔴 CRITICAL | **Effort**: Low (1 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Create `<LoadingSpinner>` component
- [ ] Create `<CalendarSkeleton>` component
- [ ] Create `<TaskListSkeleton>` component
- [ ] Add loading states to all async operations:
  - [ ] Login/authentication
  - [ ] Calendar data fetching
  - [ ] Task creation/update/delete
  - [ ] Voice transcription
  - [ ] LLM parsing
- [ ] Implement optimistic UI updates (show changes immediately)
- [ ] Add loading progress for long operations (voice upload, AI parsing)

**Acceptance Criteria**:
- ✅ No blank screens during data loading
- ✅ Skeleton screens match final UI structure
- ✅ Optimistic updates feel instant
- ✅ Progress indicators for >1s operations

---

### 4. Error Handling & User Feedback
**Priority**: 🔴 CRITICAL | **Effort**: Low (0.5 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Create standardized error message system
- [ ] Add user-friendly error messages for common failures:
  - [ ] Network errors ("Can't connect to server")
  - [ ] Validation errors ("End time must be after start time")
  - [ ] Auth errors ("Session expired, please log in")
  - [ ] Server errors ("Something went wrong, try again")
- [ ] Add input validation with inline feedback
- [ ] Implement error boundary for crash recovery
- [ ] Add "Retry" buttons for failed operations
- [ ] Log errors to console (or error tracking service)

**Acceptance Criteria**:
- ✅ All errors show clear, actionable messages
- ✅ Users know how to fix validation errors
- ✅ Network vs server errors are distinguished
- ✅ App doesn't crash on errors

---

## ⚡ HIGH PRIORITY (Strongly Recommended)

### 5. URL Routing & Deep Linking
**Priority**: 🟡 HIGH | **Effort**: Medium (1 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Install `react-router-dom`
- [ ] Define routes:
  - [ ] `/` - Home/Calendar view
  - [ ] `/calendar/:date` - Specific date view
  - [ ] `/task/:id` - Task detail view
  - [ ] `/login` - Login page
- [ ] Update navigation to use `<Link>` components
- [ ] Implement browser back/forward button support
- [ ] Add deep link handling for push notifications
- [ ] Update service worker to cache routes

**Acceptance Criteria**:
- ✅ URLs reflect current app state
- ✅ Back button works as expected
- ✅ Can share links to specific dates/tasks
- ✅ Deep links from notifications work

---

### 6. Pull-to-Refresh Gesture
**Priority**: 🟡 HIGH | **Effort**: Low (0.5 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Install `react-pull-to-refresh` or implement custom
- [ ] Add pull-to-refresh to calendar view
- [ ] Add pull-to-refresh to task list
- [ ] Show refresh indicator during sync
- [ ] Trigger data refetch on pull

**Acceptance Criteria**:
- ✅ Pull down gesture refreshes calendar
- ✅ Visual feedback during refresh
- ✅ Works smoothly on mobile devices

---

### 7. Keyboard & Input Handling
**Priority**: 🟡 HIGH | **Effort**: Low (0.5 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Auto-scroll to focused input when keyboard appears
- [ ] Dismiss keyboard on outside tap
- [ ] Add "Done" button to dismiss keyboard
- [ ] Prevent zoom on input focus (font-size: 16px minimum)
- [ ] Handle keyboard covering modals/forms

**Acceptance Criteria**:
- ✅ Keyboard never covers active input
- ✅ Easy to dismiss keyboard
- ✅ No unwanted zoom on mobile

---

## 🎨 MEDIUM PRIORITY (Nice-to-Have)

### 8. Haptic Feedback (Post-Wrap)
**Priority**: 🟢 MEDIUM | **Effort**: Low (0.5 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Install `@capacitor/haptics`
- [ ] Add haptic feedback to:
  - [ ] Button taps
  - [ ] Task completion
  - [ ] Conflict warnings
  - [ ] Pull-to-refresh
- [ ] Make haptics optional (user preference)

---

### 9. Onboarding Flow (Post-Launch)
**Priority**: 🟢 MEDIUM | **Effort**: Medium (1 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Create onboarding screens:
  - [ ] Welcome screen
  - [ ] Feature highlights (voice, AI, conflicts)
  - [ ] Permission requests (notifications, calendar)
- [ ] Add "Skip" option
- [ ] Show only on first launch
- [ ] Store completion in localStorage

---

### 10. Settings Page (Post-Launch)
**Priority**: 🟢 MEDIUM | **Effort**: Medium (1 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Create Settings page with:
  - [ ] Timezone selection
  - [ ] Default task duration
  - [ ] Notification preferences
  - [ ] Theme toggle (if adding light mode)
  - [ ] Account management (logout, delete account)
- [ ] Store preferences in backend (user profile)
- [ ] Sync preferences across devices

---

### 11. Search Functionality (v2)
**Priority**: 🟢 LOW | **Effort**: Medium (1 day) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Add search bar to navbar
- [ ] Implement backend search endpoint
- [ ] Search by task title, description, date
- [ ] Show search results in modal
- [ ] Highlight search terms in results

---

## 📦 NATIVE APP WRAPPING (After Above Complete)

### 12. Capacitor Setup
**Priority**: 🔵 FINAL STEP | **Effort**: Medium (2 days) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Install Capacitor dependencies
- [ ] Initialize Capacitor project
- [ ] Add iOS platform
- [ ] Add Android platform
- [ ] Configure app icons and splash screens
- [ ] Update `vite.config.js` for Capacitor
- [ ] Build and sync to native projects
- [ ] Test on iOS simulator
- [ ] Test on Android emulator
- [ ] Test on real devices

---

### 13. Native Features Integration
**Priority**: 🔵 POST-WRAP | **Effort**: High (3-4 days) | **Status**: ❌ Not Started

**Tasks**:
- [ ] Push Notifications:
  - [ ] Install `@capacitor/push-notifications`
  - [ ] Request permissions
  - [ ] Register device token with backend
  - [ ] Handle notification taps (deep linking)
- [ ] Local Notifications:
  - [ ] Install `@capacitor/local-notifications`
  - [ ] Schedule reminders for tasks
- [ ] Calendar Integration:
  - [ ] Install `@capacitor-community/calendar`
  - [ ] Request calendar permissions
  - [ ] Sync Momentra tasks to device calendar
- [ ] Voice Recording:
  - [ ] Test existing voice input on native
  - [ ] Add microphone permission handling

---

## 📊 Progress Tracking

| Phase | Tasks | Completed | Progress |
|-------|-------|-----------|----------|
| **Critical** | 4 | 1 | 25% |
| **High Priority** | 3 | 0 | 0% |
| **Medium Priority** | 4 | 0 | 0% |
| **Native Wrapping** | 2 | 0 | 0% |
| **TOTAL** | 13 | 1 | 8% |

---

## 🎯 Recommended Execution Order

### Week 1: Core Stability
1. JWT Authentication (Day 1)
2. Offline Handling (Day 2)
3. Loading States (Day 3)
4. Error Messages (Day 3)

### Week 2: Polish & Prep
5. URL Routing (Day 4)
6. Pull-to-Refresh (Day 5)
7. Keyboard Handling (Day 5)
8. Final testing & bug fixes (Days 6-7)

### Week 3: Native Wrapping
9. Capacitor Setup (Days 8-9)
10. Native Features (Days 10-12)
11. App Store submission prep (Days 13-14)

---

## ✅ Definition of Done

Before wrapping into native app, ensure:
- [ ] All CRITICAL tasks completed
- [ ] All HIGH PRIORITY tasks completed
- [ ] App works offline (cached data visible)
- [ ] No blank screens during loading
- [ ] All errors have user-friendly messages
- [ ] Authentication persists across sessions
- [ ] Tested on mobile browsers (iOS Safari, Chrome Android)
- [ ] Performance: <2s initial load, <500ms interactions
- [ ] Accessibility: Keyboard navigation, screen reader support

---

**Last Updated**: January 19, 2026  
**Version**: 0.5.0-alpha → Target: 0.9.0-beta
