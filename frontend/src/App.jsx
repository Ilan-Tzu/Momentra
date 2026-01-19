import { useState, useEffect, useRef } from 'react'
import { jobService } from './services/api'
import CalendarStrip from './components/CalendarStrip'
import ConfirmModal from './components/ConfirmModal'
import Navbar from './components/Navbar'
import LoginPage from './components/LoginPage'
import './App.css'

import { formatToLocalTime, toLocalISOString, toUTC, normalizeToUTC } from './utils/dateUtils'

function App() {
  const [status, setStatus] = useState('input') // input, loading, preview, success, error
  const [rawText, setRawText] = useState('')
  const [jobId, setJobId] = useState(null)
  const [candidates, setCandidates] = useState([]) // For preview
  const [errorMsg, setErrorMsg] = useState('')

  // User state
  const [user, setUser] = useState(localStorage.getItem('momentra_user') || '');


  // Calendar State (Home Screen)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calendarTasks, setCalendarTasks] = useState([])

  // Editing state (Preview Screen)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  // Recording State
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  // Task Editing State (Calendar Screen)
  const [taskEditingId, setTaskEditingId] = useState(null)
  const [taskEditForm, setTaskEditForm] = useState({})

  // Toast state
  const [showToast, setShowToast] = useState(false)

  // Navigation state
  const [activePage, setActivePage] = useState('create') // 'create' | 'templates' | 'preferences'

  // Conflict Resolution Modal State
  const [conflictModal, setConflictModal] = useState({
    isOpen: false,
    newTask: null,      // { title, start_time, end_time, candidateId }
    existingTask: null, // { id, title, start_time, end_time }
    newTaskTime: '',
    existingTaskTime: ''
  })

  useEffect(() => {
    if (user) {
      fetchCalendarTasks();
    }
  }, [user])

  useEffect(() => {
    if (status === 'preview' && candidates.length === 0) {
      reset();
    }
  }, [candidates, status])

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (status === 'preview') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [status])


  const handleLogout = () => {
    localStorage.removeItem('momentra_user');
    setUser('');
    setCalendarTasks([]);
  }

  const fetchCalendarTasks = async () => {
    try {
      const start = new Date();
      start.setDate(start.getDate() - 2);
      const end = new Date();
      end.setDate(end.getDate() + 30);
      console.log(`Fetching tasks from ${start.toISOString()} to ${end.toISOString()}`);

      const tasks = await jobService.getTasks(start.toISOString(), end.toISOString());
      console.log("Fetched calendar tasks:", tasks.length, tasks);
      // Normalize times from backend (UTC naive -> UTC Z)
      const normalized = tasks.map(t => ({
        ...t,
        start_time: normalizeToUTC(t.start_time),
        end_time: normalizeToUTC(t.end_time)
      }));
      setCalendarTasks(normalized);
    } catch (e) {
      console.error("Failed to fetch tasks", e);
    }
  }



  const handleRecord = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        chunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          setStatus('loading');
          try {
            const result = await jobService.transcribeAudio(blob);
            setRawText(prev => (prev ? prev + ' ' : '') + result.text);
            setStatus('input');
          } catch (e) {
            console.error("Transcription failed", e);
            setErrorMsg("Transcription failed. Please try again.");
            setStatus('input');
          }

          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied", err);
        setErrorMsg("Microphone access denied.");
      }
    }
  }

  const handleParse = async () => {
    if (!rawText.trim()) return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const job = await jobService.createJob(rawText);
      setJobId(job.id);
      await jobService.parseJob(job.id);
      await refreshPreview(job.id);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to process request. Please try again.');
      setStatus('input');
    }
  }

  const refreshPreview = async (id) => {
    const preview = await jobService.getJob(id);

    // Normalize Candidates: Treat Naive LLM output as LOCAL -> Convert to UTC
    const normalizedCandidates = preview.candidates.map(c => {
      const p = { ...c.parameters };
      if (p.start_time) p.start_time = normalizeToUTC(p.start_time);
      if (p.end_time) p.end_time = normalizeToUTC(p.end_time);
      return { ...c, parameters: p };
    });

    setCandidates(normalizedCandidates);
    setStatus('preview');
  }

  const finalizeAcceptance = async (candidateId, force = false) => {
    try {
      await jobService.acceptJob(jobId, {
        selected_candidate_ids: [candidateId],
        ignore_conflicts: force
      });
      await jobService.deleteJobCandidate(candidateId);
      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      await fetchCalendarTasks();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (e) {
      console.error("Auto-accept failed", e);
      // Fallback: stay in preview
      await refreshPreview(jobId);
    }
  };

  const handleAccept = async () => {
    if (!jobId) return;
    setStatus('loading');
    try {
      const allIds = candidates.map(c => c.id);
      await jobService.acceptJob(jobId, allIds);
      await fetchCalendarTasks();
      reset();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to save to calendar.');
      setStatus('preview');
    }
  }

  const startEditing = (candidate) => {
    setEditingId(candidate.id);
    const params = { ...candidate.parameters };

    // Convert stored UTC times to Local ISO for input fields (datetime-local expects YYYY-MM-DDTHH:mm)
    // Convert stored UTC times to Local ISO for input fields (datetime-local expects YYYY-MM-DDTHH:mm)
    try {
      if (params.start_time) {
        // Treat start_time as UTC (normalizeToUTC appends Z if needed)
        params.start_time = toLocalISOString(normalizeToUTC(params.start_time));
      }
      if (params.end_time) {
        params.end_time = toLocalISOString(normalizeToUTC(params.end_time));
      }
    } catch (e) {
      console.error("Failed to parse dates for editing", e);
    }

    setEditForm({
      description: candidate.description,
      parameters: params
    });
  }

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  }

  const saveEditing = async () => {
    try {
      const updated = await jobService.updateJobCandidate(editingId, {
        description: editForm.description,
        command_type: 'CREATE_TASK', // Ensure it converts to task
        parameters: {
          ...editForm.parameters,
          // Convert local input value (YYYY-MM-DDTHH:mm) to UTC ISO string
          start_time: toUTC(editForm.parameters.start_time),
          end_time: toUTC(editForm.parameters.end_time)
        }
      });

      setEditingId(null);
      if (updated.command_type !== 'AMBIGUITY') {
        await finalizeAcceptance(editingId);
      } else {
        await refreshPreview(jobId);
      }
    } catch (err) {
      console.error("Failed to update candidate", err);
    }
  }

  const updateEditField = (field, value) => {
    if (field === 'description') {
      setEditForm(prev => ({ ...prev, description: value }));
      return;
    }

    setEditForm(prev => {
      let params = { ...prev.parameters, [field]: value };

      // Auto-update end_time if start_time changes to preserve duration
      if (field === 'start_time' && prev.parameters.start_time && prev.parameters.end_time) {
        try {
          const oldStart = new Date(prev.parameters.start_time);
          const oldEnd = new Date(prev.parameters.end_time);
          const newStart = new Date(value);

          if (!isNaN(oldStart) && !isNaN(oldEnd) && !isNaN(newStart)) {
            const duration = oldEnd - oldStart;
            const newEnd = new Date(newStart.getTime() + duration);
            // newEnd to ISO string (local time ISO without Z, or just use value format)
            // datetime-local input gives YYYY-MM-DDTHH:mm
            // We need to store it in a format compatible with our backend (ISO)
            // But value is just the input string.
            // Let's construct the ISO string carefully.
            // Actually, simply keeping it as Date object and converting to ISO for storage?
            // "paramaters" usually stores strings from backend.
            // To be safe, let's use toISOString() but strip Z? 
            // Or better, let's look at how backend parses. It accepts ISO.
            // But datetime-local value is YYYY-MM-DDTHH:mm. 
            // Let's output that format for the end_time field.

            // Helper to format for datetime-local
            const toLocalIso = (d) => {
              const offset = d.getTimezoneOffset() * 60000;
              return new Date(d.getTime() - offset).toISOString().slice(0, 16);
            };

            params.end_time = toLocalIso(newEnd); // This matches the input value format
          }
        } catch (e) {
          console.error("Auto-date error", e);
        }
      }

      return { ...prev, parameters: params };
    });
  }

  const reset = () => {
    setRawText('');
    setJobId(null);
    setCandidates([]);
    setStatus('input');
    setEditingId(null);
  }

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDestructive: false
  });

  const closeConfirm = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  }

  // Task Management Handlers
  const startTaskEdit = (task) => {
    setTaskEditingId(task.id);

    const startDate = new Date(normalizeToUTC(task.start_time));
    const endDate = new Date(normalizeToUTC(task.end_time));

    const duration = endDate - startDate;

    setTaskEditForm({
      title: task.title,
      start_time: toLocalISOString(startDate),
      end_time: toLocalISOString(endDate),
      duration: duration
    });
  }

  const cancelTaskEdit = () => {
    setTaskEditingId(null);
    setTaskEditForm({});
  }

  const saveTaskEdit = async () => {
    try {
      await jobService.updateTask(taskEditingId, {
        title: taskEditForm.title,
        start_time: toUTC(taskEditForm.start_time),
        end_time: toUTC(taskEditForm.end_time)
      });
      await fetchCalendarTasks();
      setTaskEditingId(null);
    } catch (e) {
      console.error("Failed to update task", e);
      if (e.response?.status === 409) {
        let conflict = e.response.data.detail;
        console.log("Conflict response:", conflict);

        // Robust parsing: handle if conflict is a string (e.g. raw JSON or prefixed)
        if (typeof conflict === 'string') {
          try {
            if (conflict.startsWith('CONFLICT:')) {
              conflict = JSON.parse(conflict.replace('CONFLICT:', ''));
            } else {
              conflict = JSON.parse(conflict);
            }
          } catch (pErr) {
            console.error("Failed to parse conflict string", pErr);
          }
        }

        // Prepare existing task start time (Treat Naive as UTC)
        let existingStart = normalizeToUTC(conflict?.start_time);

        setConflictModal({
          isOpen: true,
          newTask: {
            id: taskEditingId,
            title: taskEditForm.title,
            start_time: taskEditForm.start_time, // This is Local ISO from input
            end_time: null // Edit form only has start_time currently
          },
          existingTask: {
            id: conflict?.id,
            title: conflict?.title,
            start_time: existingStart,
            end_time: conflict?.end_time
          },
          newTaskTime: formatToLocalTime(taskEditForm.start_time),
          existingTaskTime: formatToLocalTime(existingStart)
        });
      }
    }
  }

  const handleDeleteTask = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: 'Are you sure you want to delete this task? This action cannot be undone.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await jobService.deleteTask(id);
          await fetchCalendarTasks();
        } catch (e) {
          console.error("Failed to delete task", e);
        }
        closeConfirm();
      }
    });
  }

  // Helpers
  const selectedDayTasks = calendarTasks.filter(task => {
    if (!task.start_time) return false;
    const tDate = new Date(task.start_time);
    return tDate.getDate() === selectedDate.getDate() &&
      tDate.getMonth() === selectedDate.getMonth() &&
      tDate.getFullYear() === selectedDate.getFullYear();
  });
  // Render login page if not authenticated
  if (!user) {
    return <LoginPage onLogin={(username) => setUser(username)} />
  }
  const handleSaveConflict = async (force = false) => {
    try {
      // 1. Update existing task time if changed
      if (conflictModal.existingTask) {
        const existingDate = new Date(normalizeToUTC(conflictModal.existingTask.start_time));
        const [hours, mins] = conflictModal.existingTaskTime.split(':');
        const targetHours = parseInt(hours);
        const targetMins = parseInt(mins);

        // Only update if time actually changed
        if (existingDate.getHours() !== targetHours || existingDate.getMinutes() !== targetMins) {
          existingDate.setHours(targetHours, targetMins);

          try {
            await jobService.updateTask(conflictModal.existingTask.id, {
              start_time: existingDate.toISOString(),
              ignore_conflicts: force
            });
          } catch (err) {
            if (err.response?.status === 409) {
              let secondaryConflict = err.response.data.detail;
              if (typeof secondaryConflict === 'string') {
                try {
                  if (secondaryConflict.startsWith('CONFLICT:')) {
                    secondaryConflict = JSON.parse(secondaryConflict.replace('CONFLICT:', ''));
                  } else {
                    secondaryConflict = JSON.parse(secondaryConflict);
                  }
                } catch (pErr) { console.error(pErr); }
              }
              let existingStart = normalizeToUTC(secondaryConflict?.start_time);

              setConflictModal(prev => ({
                ...prev,
                showForceSave: true,
                existingTask: {
                  id: secondaryConflict?.id,
                  title: secondaryConflict?.title,
                  start_time: existingStart,
                  end_time: secondaryConflict?.end_time
                },
                newTaskTime: prev.newTaskTime,
                existingTaskTime: formatToLocalTime(existingStart)
              }));
              return;
            }
            throw err;
          }
        } else {
          console.log("Existing task time unchanged, skipping update.");
        }
      }

      // 2. Update new task (either candidate OR existing task)
      const newDate = new Date(normalizeToUTC(conflictModal.newTask.start_time));
      const [newHours, newMins] = conflictModal.newTaskTime.split(':');
      newDate.setHours(parseInt(newHours), parseInt(newMins));

      let newEndDate = null;
      if (conflictModal.newTask.start_time && conflictModal.newTask.end_time) {
        const originalStart = new Date(normalizeToUTC(conflictModal.newTask.start_time));
        const originalEnd = new Date(normalizeToUTC(conflictModal.newTask.end_time));
        const duration = originalEnd - originalStart;
        newEndDate = new Date(newDate.getTime() + duration);
      }

      if (conflictModal.newTask.candidateId) {
        // It's a CANDIDATE
        const updatedCandidate = await jobService.updateJobCandidate(conflictModal.newTask.candidateId, {
          parameters: {
            title: conflictModal.newTask.title,
            start_time: toUTC(newDate.toISOString()),
            end_time: newEndDate ? toUTC(newEndDate.toISOString()) : null
          },
          command_type: 'CREATE_TASK',
          ignore_conflicts: force
        });

        // Check if AMBIGUITY returned logic? (From verified logic earlier)
        // If we force, it shouldn't return AMBIGUITY.
        // But if we don't force, AMBIGUITY leads to preview refresh.
        // Wait, current logic for Candidates is: conflict -> AMBIGUITY (200).
        // My previous patch made `routes.py` return 409 for conflicts in UPDATE.
        // But `verify_conflict` script showed it returns 200 Ambiguity.
        // Ah, `update_candidate` in `services.py` catches conflict and converts to AMBIGUITY.
        // If `ignore_conflicts` is True, it skips conflict check, returns CREATE_TASK.
        // So `updatedCandidate` will be CREATE_TASK.
        // Then we call `finalizeAcceptance`.

        if (updatedCandidate.command_type === 'AMBIGUITY' && !force) {
          // Refresh preview to show conflict
          await refreshPreview(jobId);
          setConflictModal({ ...conflictModal, isOpen: false });
          return;
        }

        await finalizeAcceptance(conflictModal.newTask.candidateId, force);
      } else {
        // It's an EXISTING TASK
        await jobService.updateTask(conflictModal.newTask.id, {
          start_time: toUTC(newDate.toISOString()),
          end_time: newEndDate ? toUTC(newEndDate.toISOString()) : null,
          ignore_conflicts: force
        });
        await fetchCalendarTasks();
      }

      setConflictModal({ ...conflictModal, isOpen: false });
      setTaskEditingId(null);
      setTaskEditForm({});
      if (jobId) await refreshPreview(jobId);
      // setShowToast(true); // Assuming setShowToast is defined elsewhere
      // setTimeout(() => setShowToast(false), 3000); // Assuming setShowToast is defined elsewhere

    } catch (err) {
      // Suppress console error for 409 if not forced
      if (err.response?.status !== 409) {
        console.error("Conflict Save Failed", err);
      }

      if (!force && err.response?.status === 409) {
        let secondaryConflict = err.response.data.detail;
        if (typeof secondaryConflict === 'string') {
          try {
            if (secondaryConflict.startsWith('CONFLICT:')) {
              secondaryConflict = JSON.parse(secondaryConflict.replace('CONFLICT:', ''));
            } else {
              secondaryConflict = JSON.parse(secondaryConflict);
            }
          } catch (pErr) { console.error(pErr); }
        }
        let existingStart = normalizeToUTC(secondaryConflict?.start_time);

        setConflictModal(prev => ({
          ...prev,
          showForceSave: true, // SHOW BUTTON
          existingTask: {
            id: secondaryConflict?.id,
            title: secondaryConflict?.title,
            start_time: existingStart,
            end_time: secondaryConflict?.end_time
          },
          newTaskTime: prev.newTaskTime,
          existingTaskTime: safeTimeString(existingStart)
        }));
      }
    }
  }

  return (
    <>
      {/* Navigation Bar */}
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={handleLogout}
      />

      <div className={`container ${status === 'preview' ? 'blur-bg' : ''}`}>

        {/* Hero Section */}
        <div className="hero-section" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1>Momentra Calendar</h1>
          <p>Describe your events in your words</p>
        </div>

        {/* Home: Input Card */}
        <div className="input-card">
          <div className="input-wrapper" style={{ display: 'flex', gap: '16px', flex: 1 }}>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleParse();
                }
              }}
              placeholder="e.g., Team meeting tomorrow at 2pm, then dinner at 6pm and a Dentist appointment next Monday..."
              rows={3}
              style={{ margin: 0 }} /* Remove margin since wrapper handles gap */
            />
          </div>
          <div className="input-actions">
            <button
              className="create-btn"
              onClick={handleParse}
              disabled={!rawText.trim() || status === 'loading'}
            >
              {status === 'loading' ? 'Processing...' : 'Create Events'}
            </button>
            <button
              className={`mic-btn ${isRecording ? 'recording' : ''}`}
              onClick={handleRecord}
              style={{ backgroundColor: isRecording ? '#EF4444' : undefined }}
            >
              {isRecording ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" strokeWidth="0" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              )}
            </button>
          </div>
          {errorMsg && <p className="error-msg">{errorMsg}</p>}
        </div>

        {/* Home: Calendar Dashboard Card */}
        <div className="calendar-dashboard-card">
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 600 }}>Upcoming Events</h2>
          <CalendarStrip
            tasks={calendarTasks}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>

        <div className="day-tasks-header">
          <h3>{selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}'s Schedule</h3>
          <span className="event-badge">{selectedDayTasks.length} events</span>
        </div>

        <div className="day-tasks-list">
          {selectedDayTasks.length === 0 ? (
            <p className="empty-tasks">No events scheduled</p>
          ) : (
            selectedDayTasks.map(task => (
              <div key={task.id} className="task-row">
                {taskEditingId === task.id ? (
                  <div className="task-edit-row" style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
                    <input
                      type="time"
                      className="edit-field-mini"
                      value={formatToLocalTime(taskEditForm.start_time)}
                      onChange={e => {
                        if (!e.target.value) return;

                        // 1. Get current form date or 'now' if missing
                        const originalDate = taskEditForm.start_time ? new Date(taskEditForm.start_time) : new Date();

                        // 2. Parse the HH:MM from input
                        const [h, m] = e.target.value.split(':');

                        // 3. Set hours/minutes on the local date object (browser local time)
                        originalDate.setHours(parseInt(h), parseInt(m));
                        originalDate.setSeconds(0);
                        originalDate.setMilliseconds(0);

                        // 4. Convert to LOCAL ISO string (preserving e.g. 14:00 as 14:00) using helper
                        const localIso = toLocalISOString(originalDate);

                        // Recalculate end_time to preserve duration
                        const newStartMs = originalDate.getTime();
                        const newEndMs = newStartMs + (taskEditForm.duration || 1800000); // Default 30m
                        const newEndIso = toLocalISOString(new Date(newEndMs));

                        setTaskEditForm(prev => ({
                          ...prev,
                          start_time: localIso,
                          end_time: newEndIso
                        }));
                      }}
                    />
                    <input
                      className="edit-field-mini"
                      value={taskEditForm.title}
                      onChange={e => setTaskEditForm(prev => ({ ...prev, title: e.target.value }))}
                    />
                    <button className="save-icon-btn" onClick={() => {
                      console.log("Saving task:", taskEditingId, taskEditForm);
                      saveTaskEdit();
                    }}>✓</button>
                    <button className="cancel-icon-btn" onClick={cancelTaskEdit}>✕</button>
                  </div>
                ) : (
                  <>
                    <span className="task-time">
                      {formatToLocalTime(normalizeToUTC(task.start_time))}
                    </span>
                    <span className="task-title" style={{ flex: 1 }}>{task.title}</span>
                    <div className="task-actions">
                      <button className="icon-btn edit-icon" onClick={() => startTaskEdit(task)}>✎</button>
                      <button className="icon-btn delete-icon" onClick={() => handleDeleteTask(task.id)}>🗑️</button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {/* Review Modal Overlay */}
      {status === 'preview' && (
        <div className="review-overlay">
          <div className="review-modal">
            <div className="review-header">
              <div className="header-top">
                <h2>Review Events</h2>
                <button onClick={reset} className="close-btn">✕</button>
              </div>
              <p className="sub-header">{candidates.length} events found</p>
            </div>

            <div className="review-body">
              {candidates.map(candidate => (
                <div key={candidate.id} className="review-item-card">
                  {editingId === candidate.id ? (
                    <div className="edit-form">
                      <input
                        className="edit-field"
                        value={editForm.parameters.title || editForm.description}
                        onChange={e => {
                          updateEditField('title', e.target.value);
                          updateEditField('description', e.target.value);
                        }}
                      />
                      {/* Allow editing if command is CREATE_TASK OR if we are forcing an edit (like from 'Other') */}
                      {(candidate.command_type === 'CREATE_TASK' || candidate.command_type === 'AMBIGUITY') && (
                        <div className="edit-time-row">
                          <input type="datetime-local" className="edit-field"
                            value={editForm.parameters.start_time?.slice(0, 16) || ''}
                            onChange={e => updateEditField('start_time', e.target.value)}
                          />
                          <span className="time-sep">-</span>
                          <input type="datetime-local" className="edit-field"
                            value={editForm.parameters.end_time?.slice(0, 16) || ''}
                            onChange={e => updateEditField('end_time', e.target.value)}
                          />
                        </div>
                      )}
                      <div className="edit-buttons">
                        <button className="save-mini-btn" onClick={saveEditing}>Save</button>
                        <button className="cancel-mini-btn" onClick={cancelEditing}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {candidate.command_type === 'AMBIGUITY' ? (
                        <div className="ambiguity-content">
                          <h4>
                            {candidate.parameters.type === 'conflict' && candidate.parameters.existing_start_time
                              ? `'${candidate.parameters.title}' conflicts with '${candidate.parameters.existing_title}' at ${formatToLocalTime(normalizeToUTC(candidate.parameters.existing_start_time))}. What would you like to do?`
                              : candidate.parameters.message}
                          </h4>
                          <div className="ambiguity-opts">
                            {candidate.parameters.options?.map((opt, i) => (
                              <button key={i} onClick={async () => {
                                let val = {};
                                try { val = JSON.parse(opt.value) } catch (e) { }

                                // Handle conflict resolution options
                                if (val.discard) {
                                  // User chose to discard new task - just remove this candidate
                                  await jobService.deleteJobCandidate(candidate.id);
                                  await refreshPreview(jobId);
                                  return;
                                }

                                // Handle "Keep both" option - open conflict modal
                                if (val.keep_both) {
                                  // Extract existing task info from the conflict message
                                  // We need to get the existing task ID from the option that has remove_task_id
                                  const replaceOption = candidate.parameters.options?.find(o => {
                                    try {
                                      const parsed = JSON.parse(o.value);
                                      return parsed.remove_task_id;
                                    } catch { return false; }
                                  });
                                  let existingTaskId = null;
                                  if (replaceOption) {
                                    try {
                                      existingTaskId = JSON.parse(replaceOption.value).remove_task_id;
                                    } catch { }
                                  }

                                  // Fetch existing task details
                                  const existingTask = calendarTasks.find(t => t.id === existingTaskId);

                                  // Use the new task's start time for BOTH inputs (they conflict at this time)
                                  // Fallback to candidate params if val doesn't have it (shouldn't happen but safe)
                                  const rawTime = val.start_time || candidate.parameters.start_time;
                                  const conflictTimeLocal = rawTime ? formatToLocalTime(normalizeToUTC(rawTime)) : '09:00';
                                  setConflictModal({
                                    isOpen: true,
                                    newTask: {
                                      title: val.title,
                                      start_time: val.start_time,
                                      end_time: val.end_time,
                                      candidateId: candidate.id
                                    },
                                    existingTask: existingTask ? {
                                      id: existingTask.id,
                                      title: existingTask.title,
                                      start_time: existingTask.start_time,
                                      end_time: existingTask.end_time
                                    } : null,
                                    newTaskTime: conflictTimeLocal,
                                    existingTaskTime: conflictTimeLocal // Both start at same time for manual adjustment
                                  });
                                  return;
                                }


                                if (val.remove_task_id) {
                                  // User chose to replace - delete the existing task first
                                  try {
                                    await jobService.deleteTask(val.remove_task_id);
                                  } catch (e) {
                                    console.error("Failed to delete conflicting task", e);
                                  }
                                }

                                // Convert to CREATE_TASK with the selected parameters
                                const newTitle = val.title || candidate.description.replace('Conflict: ', '').replace('Ambiguity: ', '');
                                const updated = await jobService.updateJobCandidate(candidate.id, {
                                  description: newTitle,
                                  command_type: 'CREATE_TASK',
                                  parameters: {
                                    title: newTitle,
                                    start_time: val.start_time,
                                    end_time: val.end_time,
                                    description: val.description
                                  }
                                });

                                if (updated.command_type !== 'AMBIGUITY') {
                                  await finalizeAcceptance(candidate.id);
                                } else {
                                  await refreshPreview(jobId);
                                }
                              }}>{opt.label}</button>
                            ))}
                            <button className="other-opt-btn" onClick={() => {
                              // Pre-fill with first option's time, or fallback to now
                              let prefillStart = new Date();
                              let prefillTitle = candidate.parameters?.title || candidate.description.replace('Ambiguity: ', '');

                              // Try to parse the first option
                              if (candidate.parameters.options?.length > 0) {
                                try {
                                  const firstOpt = JSON.parse(candidate.parameters.options[0].value);
                                  if (firstOpt.start_time) {
                                    prefillStart = new Date(normalizeToUTC(firstOpt.start_time));
                                  }
                                  if (firstOpt.title) {
                                    prefillTitle = firstOpt.title;
                                  }
                                } catch (e) { console.error("Failed to parse first option", e); }
                              }

                              // Calculate end_time as 30 min after start
                              const prefillEnd = new Date(prefillStart.getTime() + 30 * 60 * 1000);

                              // Convert to CREATE_TASK and enter edit mode
                              jobService.updateJobCandidate(candidate.id, {
                                command_type: 'CREATE_TASK',
                                description: prefillTitle
                              }).then(() => {
                                setEditingId(candidate.id);
                                setEditForm({
                                  description: prefillTitle,
                                  parameters: {
                                    ...candidate.parameters,
                                    title: prefillTitle,
                                    start_time: toLocalISOString(prefillStart),
                                    end_time: toLocalISOString(prefillEnd)
                                  }
                                });
                              });
                            }}>Other</button>
                          </div>
                        </div>
                      ) : (
                        <div className="candidate-content">
                          <h3>{candidate.description}</h3>
                          <div className="candidate-meta">
                            <span>📅 {candidate.parameters.start_time ? new Date(normalizeToUTC(candidate.parameters.start_time)).toLocaleDateString() : 'No date'}</span>
                            <span>🕒 {candidate.parameters.start_time ? (
                              <>
                                {formatToLocalTime(normalizeToUTC(candidate.parameters.start_time))}
                                {candidate.parameters.end_time && (
                                  <> - {formatToLocalTime(normalizeToUTC(candidate.parameters.end_time))}</>
                                )}
                              </>
                            ) : ''}</span>
                          </div>
                        </div>
                      )}

                      <div className="card-controls">
                        <button className="reject-btn" onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: 'Reject Event',
                            message: 'Are you sure you want to reject this event?',
                            isDestructive: true,
                            onConfirm: async () => {
                              await jobService.deleteJobCandidate(candidate.id);
                              await refreshPreview(jobId);
                              closeConfirm();
                            }
                          });
                        }}>Reject</button>

                        {candidate.command_type !== 'AMBIGUITY' && (
                          <>
                            <button className="accept-btn" onClick={() => finalizeAcceptance(candidate.id)}>Accept</button>
                            <button className="edit-btn-neutral" onClick={() => startEditing(candidate)}>Edit</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="review-footer">
              <button className="footer-reject" onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Reject All Events',
                  message: 'Are you sure you want to reject all these events? This action cannot be undone.',
                  isDestructive: true,
                  onConfirm: () => {
                    reset();
                    closeConfirm();
                  }
                });
              }}>Reject All</button>
              <button className="footer-accept" onClick={handleAccept}>Accept All</button>
            </div>
          </div>
        </div>
      )
      }

      {/* Toast */}
      {
        showToast && (
          <div className="toast">
            Event added!
          </div>
        )
      }

      {/* Conflict Resolution Modal */}
      {conflictModal.isOpen && (
        <div className="review-overlay">
          <div className="conflict-modal">
            <div className="conflict-header">
              <h2>Resolve Time Conflict</h2>
              <button className="close-btn" onClick={() => setConflictModal({ ...conflictModal, isOpen: false })}>×</button>
            </div>
            <p className="conflict-subtext">Adjust the times for these overlapping events:</p>

            <div className="conflict-tasks">
              {/* New Task */}
              <div className="conflict-task-card new-task">
                <div className="task-badge new">New</div>
                <h4>{conflictModal.newTask?.title || 'New Task'}</h4>
                <div className="time-input-group">
                  <label>Time</label>
                  <div className="time-control-group">
                    <div className="arrow-stack">
                      <button className="arrow-btn" onClick={() => {
                        const [h, m] = conflictModal.newTaskTime.split(':').map(Number);
                        const d = new Date(); d.setHours(h, m + 30);
                        setConflictModal(prev => ({ ...prev, newTaskTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }));
                      }}>▲</button>
                      <button className="arrow-btn" onClick={() => {
                        const [h, m] = conflictModal.newTaskTime.split(':').map(Number);
                        const d = new Date(); d.setHours(h, m - 30);
                        setConflictModal(prev => ({ ...prev, newTaskTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }));
                      }}>▼</button>
                    </div>
                    <input
                      className="time-input-styled"
                      type="time"
                      value={conflictModal.newTaskTime}
                      onChange={(e) => setConflictModal({ ...conflictModal, newTaskTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Existing Task */}
              {conflictModal.existingTask && (
                <div className="conflict-task-card existing-task">
                  <div className="task-badge existing">Existing</div>
                  <h4>{conflictModal.existingTask?.title || 'Existing Task'}</h4>
                  <div className="time-input-group">
                    <label>Time</label>
                    <div className="time-control-group">
                      <div className="arrow-stack">
                        <button className="arrow-btn" onClick={() => {
                          const [h, m] = conflictModal.existingTaskTime.split(':').map(Number);
                          const d = new Date(); d.setHours(h, m + 30);
                          setConflictModal(prev => ({ ...prev, existingTaskTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }));
                        }}>▲</button>
                        <button className="arrow-btn" onClick={() => {
                          const [h, m] = conflictModal.existingTaskTime.split(':').map(Number);
                          const d = new Date(); d.setHours(h, m - 30);
                          setConflictModal(prev => ({ ...prev, existingTaskTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }));
                        }}>▼</button>
                      </div>
                      <input
                        className="time-input-styled"
                        type="time"
                        value={conflictModal.existingTaskTime}
                        onChange={(e) => setConflictModal({ ...conflictModal, existingTaskTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="conflict-actions">
              <button
                className="conflict-cancel"
                onClick={() => setConflictModal({ ...conflictModal, isOpen: false })}
              >
                Cancel
              </button>
              {conflictModal.showForceSave && (
                <button
                  className="conflict-save-anyway"
                  style={{ backgroundColor: '#ff9800', marginRight: '10px' }}
                  onClick={() => handleSaveConflict(true)}
                >
                  Save Anyway
                </button>
              )}
              <button
                className="conflict-save"
                onClick={() => handleSaveConflict(false)}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.isDestructive ? 'Delete' : 'Confirm'}
        isDestructive={confirmModal.isDestructive}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
    </>
  )
}

export default App
