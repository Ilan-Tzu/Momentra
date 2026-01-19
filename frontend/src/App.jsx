import { useState, useEffect, useRef } from 'react'
import { jobService } from './services/api'
import CalendarStrip from './components/CalendarStrip'
import ConfirmModal from './components/ConfirmModal'
import Navbar from './components/Navbar'
import LoginPage from './components/LoginPage'
import EditEventModal from './components/EditEventModal'
import './App.css'

import { formatToLocalTime, toLocalISOString, toUTC, normalizeToUTC, handleTimeShift } from './utils/dateUtils'

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

  // Unified Edit Modal State
  const [editModal, setEditModal] = useState({
    isOpen: false,
    event: null, // The object being edited
    type: 'task' // 'task' | 'candidate'
  });

  // Recording State
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

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
    existingTaskTime: '',
    newTaskDate: '',
    existingTaskDate: ''
  })

  // Global Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDestructive: false
  });

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

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


  const reset = () => {
    setRawText('');
    setCandidates([]);
    setJobId(null);
    setStatus('input');
    setErrorMsg('');
  }

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

  // Unified Edit Handlers
  const handleEditOpen = (item, type) => {
    setEditModal({
      isOpen: true,
      event: item,
      type: type
    });
  };

  const handleEditClose = () => {
    setEditModal({ isOpen: false, event: null, type: 'task' });
  };

  const handleEditSave = async (updatedEvent) => {
    try {
      if (editModal.type === 'task') {
        const id = updatedEvent.id;
        await jobService.updateTask(id, {
          title: updatedEvent.title,
          description: updatedEvent.description,
          start_time: toUTC(updatedEvent.start_time), // Local ISO -> UTC
          end_time: toUTC(updatedEvent.end_time)
        });
        await fetchCalendarTasks();
      } else {
        // Candidate
        const id = updatedEvent.id;
        const updated = await jobService.updateJobCandidate(id, {
          description: updatedEvent.description,
          command_type: 'CREATE_TASK',
          parameters: {
            ...updatedEvent.parameters,
            title: updatedEvent.title,
            start_time: toUTC(updatedEvent.start_time),
            end_time: toUTC(updatedEvent.end_time)
          }
        });

        if (updated.command_type !== 'AMBIGUITY') {
          // Only finalize if no ambiguity (conflict) returned
          // Wait, if 409, it throws? No, candidate update returns 200 with AMBIGUITY.
          // But my recent change made it 409?
          // Let's stick to standard flow: if updated, try finalize.
          // Actually finalizeAcceptance calls accept_candidates.
          // If we update here, we just save the candidate state.
          // The "Accept" button in the UI calls finalizeAcceptance.
          // "Edit" just updates the temporary state.
          // So we just refresh preview.
          await refreshPreview(jobId);
        } else {
          await refreshPreview(jobId);
        }
      }
      handleEditClose();
    } catch (e) {
      console.error("Failed to save edit", e);
      if (e.response?.status === 409) {
        // Conflict handling for TASKS (Candidates usually return 200 Ambiguity, but let's be safe)
        handleEditClose(); // Close edit modal

        let conflict = e.response.data.detail;
        if (typeof conflict === 'string') {
          try {
            if (conflict.startsWith('CONFLICT:')) conflict = JSON.parse(conflict.replace('CONFLICT:', ''));
            else conflict = JSON.parse(conflict);
          } catch (pErr) { console.error(pErr); }
        }
        let existingStart = normalizeToUTC(conflict?.start_time);

        setConflictModal({
          isOpen: true,
          newTask: {
            id: editModal.type === 'task' ? updatedEvent.id : null,
            candidateId: editModal.type === 'candidate' ? updatedEvent.id : null,
            title: updatedEvent.title,
            start_time: toUTC(updatedEvent.start_time),
            end_time: toUTC(updatedEvent.end_time)
          },
          existingTask: {
            id: conflict?.id,
            title: conflict?.title,
            start_time: existingStart,
            end_time: conflict?.end_time
          },
          newTaskTime: formatToLocalTime(normalizeToUTC(toUTC(updatedEvent.start_time))),
          existingTaskTime: formatToLocalTime(existingStart),
          newTaskDate: updatedEvent.start_time.split('T')[0],
          existingTaskDate: existingStart?.split('T')[0] || ''
        });
      }
    }
  };

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
      // 1. Update existing task first if changed
      if (conflictModal.existingTask) {
        const datePart = conflictModal.existingTaskDate || new Date(normalizeToUTC(conflictModal.existingTask.start_time)).toISOString().split('T')[0];
        const timePart = conflictModal.existingTaskTime || '09:00';
        const mergedIso = `${datePart}T${timePart}`;
        const dtObj = new Date(mergedIso);

        let mergedEndIso = null;
        if (conflictModal.existingTask.start_time && conflictModal.existingTask.end_time) {
          const originalStart = new Date(normalizeToUTC(conflictModal.existingTask.start_time));
          const originalEnd = new Date(normalizeToUTC(conflictModal.existingTask.end_time));
          const duration = originalEnd - originalStart;
          const endDt = new Date(dtObj.getTime() + duration);

          if (endDt <= dtObj) {
            alert(`Existing task "${conflictModal.existingTask.title}" has invalid duration.`);
            return;
          }
          mergedEndIso = endDt.toISOString();
        }

        const existingOriginal = new Date(normalizeToUTC(conflictModal.existingTask.start_time));
        if (existingOriginal.getTime() !== dtObj.getTime()) {
          try {
            await jobService.updateTask(conflictModal.existingTask.id, {
              start_time: toUTC(mergedIso),
              end_time: mergedEndIso ? toUTC(mergedEndIso) : null,
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
                existingTaskTime: formatToLocalTime(existingStart),
                existingTaskDate: existingStart?.split('T')[0] || ''
              }));
              return;
            }
            throw err;
          }
        }
      }

      // 2. Update new task
      const newDatePart = conflictModal.newTaskDate || new Date(normalizeToUTC(conflictModal.newTask.start_time)).toISOString().split('T')[0];
      const newTimePart = conflictModal.newTaskTime || '09:00';
      const mergedNewIso = `${newDatePart}T${newTimePart}`;
      const newDtObj = new Date(mergedNewIso);

      let newEndDateIso = null;
      if (conflictModal.newTask.start_time && conflictModal.newTask.end_time) {
        const originalStart = new Date(normalizeToUTC(conflictModal.newTask.start_time));
        const originalEnd = new Date(normalizeToUTC(conflictModal.newTask.end_time));
        const duration = originalEnd - originalStart;
        const newEndDt = new Date(newDtObj.getTime() + duration);

        if (newEndDt <= newDtObj) {
          alert(`New task "${conflictModal.newTask.title}" has invalid duration.`);
          return;
        }
        newEndDateIso = newEndDt.toISOString();
      }

      if (conflictModal.newTask.candidateId) {
        const updatedCandidate = await jobService.updateJobCandidate(conflictModal.newTask.candidateId, {
          parameters: {
            title: conflictModal.newTask.title,
            start_time: toUTC(mergedNewIso),
            end_time: newEndDateIso ? toUTC(newEndDateIso) : null
          },
          command_type: 'CREATE_TASK',
          ignore_conflicts: force
        });

        if (updatedCandidate.command_type === 'AMBIGUITY' && !force) {
          await refreshPreview(jobId);
          setConflictModal({ ...conflictModal, isOpen: false });
          return;
        }

        await finalizeAcceptance(conflictModal.newTask.candidateId, force);
      } else {
        await jobService.updateTask(conflictModal.newTask.id, {
          start_time: toUTC(mergedNewIso),
          end_time: newEndDateIso ? toUTC(newEndDateIso) : null,
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
          existingTaskTime: formatToLocalTime(existingStart),
          existingTaskDate: existingStart?.split('T')[0] || ''
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
                <div className="task-time">
                  {formatToLocalTime(task.start_time)} - {formatToLocalTime(task.end_time)}
                </div>
                <div className="task-content">
                  <h4>{task.title}</h4>
                </div>
                <div className="task-actions">
                  <button className="icon-btn edit-btn" onClick={() => handleEditOpen(task, 'task')}>✎</button>
                  <button className="icon-btn delete-btn" onClick={() => handleDeleteTask(task.id)}>🗑</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Review Modal Overlay */}
      {
        status === 'preview' && (
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
                    <div className="card-content">
                      <h3>{candidate.parameters?.title && candidate.parameters.title !== 'CREATE_TASK' ? candidate.parameters.title : (candidate.description !== 'CREATE_TASK' ? candidate.description : 'New Event')}</h3>

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

                                if (val.discard) {
                                  await jobService.deleteJobCandidate(candidate.id);
                                  await refreshPreview(jobId);
                                  return;
                                }

                                if (val.keep_both) {
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

                                  const existingTask = calendarTasks.find(t => t.id === existingTaskId);
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
                                    existingTaskTime: conflictTimeLocal,
                                    newTaskDate: val.start_time ? new Date(val.start_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                    existingTaskDate: existingTask?.start_time ? new Date(existingTask.start_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
                                  });
                                  return;
                                }

                                if (val.remove_task_id) {
                                  try {
                                    await jobService.deleteTask(val.remove_task_id);
                                  } catch (e) {
                                    console.error("Failed to delete conflicting task", e);
                                  }
                                }

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
                              let prefillStart = new Date();
                              let prefillTitle = candidate.parameters?.title || candidate.description.replace('Ambiguity: ', '');

                              if (candidate.parameters.options?.length > 0) {
                                try {
                                  const firstOpt = JSON.parse(candidate.parameters.options[0].value);
                                  if (firstOpt.start_time) prefillStart = new Date(normalizeToUTC(firstOpt.start_time));
                                  if (firstOpt.title) prefillTitle = firstOpt.title;
                                } catch (e) { console.error("Failed to parse first option", e); }
                              }

                              const prefillEnd = new Date(prefillStart.getTime() + 30 * 60 * 1000);

                              handleEditOpen({
                                id: candidate.id,
                                description: prefillTitle,
                                parameters: {
                                  ...candidate.parameters,
                                  title: prefillTitle,
                                  start_time: prefillStart.toISOString(),
                                  end_time: prefillEnd.toISOString()
                                }
                              }, 'candidate');
                            }}>Other</button>
                          </div>
                        </div>
                      ) : (
                        <div className="candidate-content">
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
                    </div>

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
                          <button className="edit-btn-neutral" onClick={() => handleEditOpen(candidate, 'candidate')}>Edit</button>
                        </>
                      )}
                    </div>
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
      {
        conflictModal.isOpen && (
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
                  <div className="edit-time-container">
                    <div className="edit-time-row-split">
                      <label>Start</label>
                      <div className="split-inputs">
                        <input
                          type="date"
                          className="edit-field date-input"
                          value={conflictModal.newTaskDate}
                          onChange={(e) => setConflictModal(prev => ({ ...prev, newTaskDate: e.target.value }))}
                        />
                        <div className="time-control-group">
                          <div className="arrow-stack">
                            <button className="arrow-btn" onClick={() => {
                              const shifted = handleTimeShift(conflictModal.newTaskTime, 30);
                              setConflictModal(prev => ({ ...prev, newTaskTime: shifted }));
                            }}>▲</button>
                            <button className="arrow-btn" onClick={() => {
                              const shifted = handleTimeShift(conflictModal.newTaskTime, -30);
                              setConflictModal(prev => ({ ...prev, newTaskTime: shifted }));
                            }}>▼</button>
                          </div>
                          <input
                            className="time-input-styled"
                            type="time"
                            value={conflictModal.newTaskTime}
                            onChange={(e) => setConflictModal(prev => ({ ...prev, newTaskTime: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Existing Task */}
                {conflictModal.existingTask && (
                  <div className="conflict-task-card existing-task">
                    <div className="task-badge existing">Existing</div>
                    <h4>{conflictModal.existingTask?.title || 'Existing Task'}</h4>
                    <div className="edit-time-container">
                      <div className="edit-time-row-split">
                        <label>Start</label>
                        <div className="split-inputs">
                          <input
                            type="date"
                            className="edit-field date-input"
                            value={conflictModal.existingTaskDate}
                            onChange={(e) => setConflictModal(prev => ({ ...prev, existingTaskDate: e.target.value }))}
                          />
                          <div className="time-control-group">
                            <div className="arrow-stack">
                              <button className="arrow-btn" onClick={() => {
                                const shifted = handleTimeShift(conflictModal.existingTaskTime, 30);
                                setConflictModal(prev => ({ ...prev, existingTaskTime: shifted }));
                              }}>▲</button>
                              <button className="arrow-btn" onClick={() => {
                                const shifted = handleTimeShift(conflictModal.existingTaskTime, -30);
                                setConflictModal(prev => ({ ...prev, existingTaskTime: shifted }));
                              }}>▼</button>
                            </div>
                            <input
                              className="time-input-styled"
                              type="time"
                              value={conflictModal.existingTaskTime}
                              onChange={(e) => setConflictModal(prev => ({ ...prev, existingTaskTime: e.target.value }))}
                            />
                          </div>
                        </div>
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
        )
      }

      {/* Unified Edit Modal */}
      <EditEventModal
        isOpen={editModal.isOpen}
        onClose={handleEditClose}
        onSave={handleEditSave}
        event={editModal.event}
        type={editModal.type}
      />

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
