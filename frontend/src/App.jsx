import { useState, useEffect, useRef } from 'react'
import { jobService } from './services/api'
import { Trash2, Edit3, Check, X } from 'lucide-react'
import CalendarStrip from './components/CalendarStrip'
import ConfirmModal from './components/ConfirmModal'
import Navbar from './components/Navbar'
import LoginPage from './components/LoginPage'
import EditEventModal from './components/EditEventModal'
import PreferencesPage from './components/PreferencesPage'
import TemplatesPage from './components/TemplatesPage'
import './App.css'
import './mobile.css'

import { formatToLocalTime, toLocalISOString, toUTC, normalizeToUTC, handleTimeShift, formatToLocalDate } from './utils/dateUtils'
import { getUser, clearTokens } from './utils/auth'

function App() {
  const [status, setStatus] = useState('input') // input, loading, preview, success, error
  const [rawText, setRawText] = useState('')
  const [jobId, setJobId] = useState(null)
  const [candidates, setCandidates] = useState([]) // For preview
  const [errorMsg, setErrorMsg] = useState('')
  const [tasksAddedInCurrentSession, setTasksAddedInCurrentSession] = useState(false);
  const [newlyAddedTaskIds, setNewlyAddedTaskIds] = useState([]);

  // User state
  const [user, setUser] = useState(getUser()?.username || '');


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
  const [preferences, setPreferences] = useState(null);

  // ... (conflict modal state) ...

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

  // Search State
  const [searchModal, setSearchModal] = useState({
    isOpen: false,
    query: '',
    results: []
  });

  const [highlightedTaskId, setHighlightedTaskId] = useState(null);
  const scheduleRef = useRef(null);
  const inputRef = useRef(null);

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  // Search handlers
  const handleSearchOpen = () => {
    setSearchModal({ isOpen: true, query: '', results: [] });
  };

  const handleSearchClose = () => {
    setSearchModal({ isOpen: false, query: '', results: [] });
  };

  const handleSearchQuery = (query) => {
    setSearchModal(prev => ({ ...prev, query }));

    if (!query.trim()) {
      setSearchModal(prev => ({ ...prev, results: [] }));
      return;
    }

    // Search through all calendar tasks
    const results = calendarTasks.filter(task =>
      task.title?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10); // Limit to 10 results

    setSearchModal(prev => ({ ...prev, results }));
  };

  const handleSelectSearchResult = (task) => {
    // Navigate to the task's date
    const taskDate = new Date(normalizeToUTC(task.start_time));
    setSelectedDate(taskDate);

    // Highlight the task
    setHighlightedTaskId(task.id);

    // Remove highlight after 3 seconds
    setTimeout(() => {
      setHighlightedTaskId(null);
    }, 3000);

    // Close search modal
    handleSearchClose();
  };

  const fetchPreferences = async () => {
    try {
      const data = await jobService.getPreferences();
      setPreferences(data);
    } catch (e) {
      console.error("Failed to fetch preferences", e);
    }
  }

  useEffect(() => {
    if (user) {
      fetchCalendarTasks();
      fetchPreferences();
    }
  }, [user])
  const handleSelectDate = (date) => {
    setSelectedDate(date);
    // Removed auto-scroll here as it conflicts with 'only scroll if added' logic
  };

  useEffect(() => {
    if (status === 'preview' && candidates.length === 0) {
      // Pass the session state to reset so it knows whether to scroll based on earlier additions
      reset(tasksAddedInCurrentSession);
    }
  }, [candidates, status, tasksAddedInCurrentSession])

  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    // Only scroll automatically if we AREN'T in the middle of a review/loading
    if (scheduleRef.current && activePage === 'create' && status === 'input') {
      scheduleRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedDate]);

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


  const reset = (shouldScroll = false) => {
    setRawText('');
    setCandidates([]);
    setJobId(null);
    setStatus('input');
    setErrorMsg('');
    setTasksAddedInCurrentSession(false);

    if (shouldScroll && scheduleRef.current) {
      setTimeout(() => {
        scheduleRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  const handleCloseReview = () => {
    if (candidates.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Discard Events?',
        message: `You have ${candidates.length} event${candidates.length === 1 ? '' : 's'} remaining to review. Closing will discard them. Are you sure?`,
        isDestructive: true,
        onConfirm: () => {
          reset(tasksAddedInCurrentSession);
          closeConfirm();
        }
      });
    } else {
      reset(tasksAddedInCurrentSession);
    }
  };

  const handleLogout = () => {
    clearTokens();
    setUser('');
    setCalendarTasks([]);
  }

  const handleSelectTemplate = (text) => {
    setRawText(text);
    setActivePage('create');
  }

  const fetchCalendarTasks = async () => {
    try {
      // Fetch from 7 days ago to 60 days in future to ensure we don't have "ghost" events
      // that exist in the DB but are just outside our window.
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setDate(end.getDate() + 60);
      end.setHours(23, 59, 59, 999);

      const tasks = await jobService.getTasks(start.toISOString(), end.toISOString());
      console.log("Fetched calendar tasks:", tasks.length);

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
    setTasksAddedInCurrentSession(false);

    try {
      const job = await jobService.createJob(rawText);
      setJobId(job.id);
      await jobService.parseJob(job.id);
      await refreshPreview(job.id, true);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to process request. Please try again.');
      setStatus('input');
    }
  }

  const refreshPreview = async (id, isInitial = false) => {
    const preview = await jobService.getJob(id);

    // Normalize Candidates: Treat Naive LLM output as LOCAL -> Convert to UTC
    const normalizedCandidates = preview.candidates.map(c => {
      const p = { ...c.parameters };
      // LLM returns times in user's local timezone, so we need to convert to UTC
      if (p.start_time) p.start_time = toUTC(p.start_time);
      if (p.end_time) p.end_time = toUTC(p.end_time);
      if (p.existing_start_time) p.existing_start_time = toUTC(p.existing_start_time);
      return { ...c, parameters: p };
    });

    if (normalizedCandidates.length === 0) {
      if (isInitial) {
        setErrorMsg("I couldn't identify any specific scheduling intent in that message. Try being a bit more specific about the task and time!");
        // Auto-clear after 5 seconds
        setTimeout(() => setErrorMsg(prev => prev.includes('intent') ? '' : prev), 5000);
      }
      setStatus('input');
      return;
    }

    setCandidates(normalizedCandidates);
    setStatus('preview');
  }

  const finalizeAcceptance = async (candidateIds, force = false) => {
    try {
      const ids = Array.isArray(candidateIds) ? candidateIds : [candidateIds];
      const res = await jobService.acceptJob(jobId, {
        selected_candidate_ids: ids,
        ignore_conflicts: force
      });

      if (res.tasks_created?.length > 0) {
        setTasksAddedInCurrentSession(true);
        const newIds = res.tasks_created.map(t => t.id);
        setNewlyAddedTaskIds(prev => [...prev, ...newIds]);

        // Take user there (first task)
        const first = res.tasks_created[0];
        if (first.start_time) {
          setSelectedDate(new Date(normalizeToUTC(first.start_time)));
        }

        // Clear animation
        setTimeout(() => {
          setNewlyAddedTaskIds(prev => prev.filter(id => !newIds.includes(id)));
        }, 5000);
      }

      // Use server-provided remaining candidates (which may have been converted to conflicts)
      if (res.remaining_candidates) {
        const normalized = res.remaining_candidates.map(c => {
          const p = { ...c.parameters };
          if (p.start_time) p.start_time = toUTC(p.start_time);
          if (p.end_time) p.end_time = toUTC(p.end_time);
          if (p.existing_start_time) p.existing_start_time = toUTC(p.existing_start_time);
          return { ...c, parameters: p };
        });
        setCandidates(normalized);

        if (normalized.length === 0) {
          reset(tasksAddedInCurrentSession || res.tasks_created?.length > 0);
        }
      } else {
        // Fallback if field missing
        const remainingCandidates = candidates.filter(c => !ids.includes(c.id));
        setCandidates(remainingCandidates);
        if (remainingCandidates.length === 0) {
          reset(tasksAddedInCurrentSession || res.tasks_created?.length > 0);
        }
      }

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
      const res = await jobService.acceptJob(jobId, allIds);
      if (res.tasks_created?.length > 0) {
        setTasksAddedInCurrentSession(true);
        const newIds = res.tasks_created.map(t => t.id);
        setNewlyAddedTaskIds(prev => [...prev, ...newIds]);

        // Take user there (first task)
        const first = res.tasks_created[0];
        if (first.start_time) {
          setSelectedDate(new Date(normalizeToUTC(first.start_time)));
        }

        // Clear animation
        setTimeout(() => {
          setNewlyAddedTaskIds(prev => prev.filter(id => !newIds.includes(id)));
        }, 5000);
      }
      await fetchCalendarTasks();

      // Check if job still has remaining candidates (partial success/conflicts)
      const updatedJob = await jobService.getJob(jobId);
      if (updatedJob.status === 'PARSED' && updatedJob.candidates.length > 0) {
        // Partial success - some tasks created, others became ambiguities
        await refreshPreview(jobId);
        setErrorMsg('Some events conflicted. Please resolve them below.');
      } else {
        // Complete success - reset with true if actually tasks were added
        const wasAdded = (res.tasks_created?.length > 0) || tasksAddedInCurrentSession;
        reset(wasAdded);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
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
          start_time: toUTC(updatedEvent.start_time),
          end_time: toUTC(updatedEvent.end_time)
        });
        await fetchCalendarTasks();
        // Update selected date to the new start date to "follow" the task
        const newDate = new Date(updatedEvent.start_time);
        if (!isNaN(newDate.getTime())) {
          setSelectedDate(newDate);
        }
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
          existingTaskDate: existingStart?.split('T')[0] || '',
          suggestion: conflict?.suggestion
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
    try {
      const taskStart = new Date(normalizeToUTC(task.start_time));
      let taskEnd = task.end_time ? new Date(normalizeToUTC(task.end_time)) : null;

      // Fallback for missing end_time (assume 30 mins)
      if (!taskEnd || isNaN(taskEnd.getTime())) {
        taskEnd = new Date(taskStart.getTime() + 30 * 60000);
      }

      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      return taskStart < dayEnd && taskEnd > dayStart;
    } catch (e) { return false; }
  }).map(task => {
    const targetDateStr = formatToLocalDate(selectedDate);
    const startLocal = formatToLocalDate(new Date(normalizeToUTC(task.start_time)));

    // Fallback for endLocal calculation
    let endLocal;
    if (task.end_time) {
      endLocal = formatToLocalDate(new Date(normalizeToUTC(task.end_time)));
    } else {
      // Default to same day if missing
      endLocal = startLocal;
    }

    let taskType = 'normal';
    if (startLocal !== endLocal) {
      if (targetDateStr === startLocal) taskType = 'task-start';
      else if (targetDateStr === endLocal) taskType = 'task-end';
      else taskType = 'task-middle';
    }
    return { ...task, taskType };
  });
  // Render login page if not authenticated
  if (!user) {
    return <LoginPage onLogin={(username) => setUser(username)} />
  }
  const handleSaveConflict = async (force = false) => {
    try {
      // 1. Update existing task first if changed
      if (conflictModal.existingTask) {
        const datePart = conflictModal.existingTaskDate || toLocalISOString(new Date(normalizeToUTC(conflictModal.existingTask.start_time))).split('T')[0];
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
            if (conflictModal.existingTask.isCandidate) {
              await jobService.updateJobCandidate(conflictModal.existingTask.id, {
                parameters: {
                  title: conflictModal.existingTask.title,
                  start_time: toUTC(mergedIso),
                  end_time: mergedEndIso ? toUTC(mergedEndIso) : null
                },
                command_type: 'CREATE_TASK'
              });
            } else {
              await jobService.updateTask(conflictModal.existingTask.id, {
                start_time: toUTC(mergedIso),
                end_time: mergedEndIso ? toUTC(mergedEndIso) : null,
                ignore_conflicts: force
              });
            }
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
      const newDatePart = conflictModal.newTaskDate || toLocalISOString(new Date(normalizeToUTC(conflictModal.newTask.start_time))).split('T')[0];
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

        const idsToAccept = [conflictModal.newTask.candidateId];
        if (conflictModal.existingTask?.isCandidate) {
          idsToAccept.push(conflictModal.existingTask.id);
        }
        await finalizeAcceptance(idsToAccept, force);
      } else {
        await jobService.updateTask(conflictModal.newTask.id, {
          start_time: toUTC(mergedNewIso),
          end_time: newEndDateIso ? toUTC(newEndDateIso) : null,
          ignore_conflicts: force
        });
        await fetchCalendarTasks();
      }

      setConflictModal({ ...conflictModal, isOpen: false });
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

      {activePage === 'create' && (
        <>
          <div className={`container ${status === 'preview' ? 'blur-bg' : ''}`}>

            {/* Hero Section */}
            <div className="hero-section" style={{ textAlign: 'center' }} ref={inputRef}>
              <h1>Momentra Calendar</h1>
              <p>Describe your events in your words</p>
            </div>

            {/* Home: Input Card */}
            <div className="input-card">
              <div className="input-wrapper" style={{ display: 'flex', gap: '16px', flex: 1 }}>

                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  onFocus={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
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
            {(status === 'input' || status === 'preview') && (
              <>
                <div className="calendar-dashboard-card">
                  <h2 className="section-header">Upcoming Events</h2>
                  <CalendarStrip
                    tasks={calendarTasks}
                    selectedDate={selectedDate}
                    onSelectDate={handleSelectDate}
                    newlyAddedTaskIds={newlyAddedTaskIds}
                  />
                </div>

                <div className="day-tasks-header" ref={scheduleRef}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="schedule-day-name">{selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}'s Schedule</span>
                    <span className="schedule-date-label">{selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div className="event-badge-premium">
                      <span className="event-count">{selectedDayTasks.length}</span>
                      <span className="event-label">{selectedDayTasks.length === 1 ? 'event' : 'events'}</span>
                    </div>
                    <button
                      className="search-btn"
                      onClick={handleSearchOpen}
                      title="Search events"
                    >
                      <span style={{ fontSize: '20px', fontWeight: 'bold' }}>⌕</span>
                    </button>
                  </div>
                </div>

                <div className="day-tasks-list">
                  {selectedDayTasks.length === 0 ? (
                    <p className="empty-tasks">No events scheduled</p>
                  ) : (
                    selectedDayTasks.map(task => {
                      let displayTime = `${formatToLocalTime(task.start_time, preferences?.time_format_24h)} - ${formatToLocalTime(task.end_time, preferences?.time_format_24h)}`;
                      if (task.taskType === 'task-start') displayTime = `Start ${formatToLocalTime(task.start_time, preferences?.time_format_24h)}`;
                      else if (task.taskType === 'task-end') displayTime = `End ${formatToLocalTime(task.end_time, preferences?.time_format_24h)}`;
                      else if (task.taskType === 'task-middle') displayTime = 'Continued';

                      return (
                        <div key={task.id} className={`task-row ${task.taskType !== 'normal' ? 'multi-day' : ''} ${task.taskType} ${highlightedTaskId === task.id ? 'highlighted' : ''} ${newlyAddedTaskIds.includes(task.id) ? 'task-newly-added' : ''}`}>
                          <div className="task-time">
                            {displayTime}
                          </div>
                          <div className="task-content">
                            <h4>{task.title}</h4>
                          </div>
                          <div className="task-actions">
                            <button className="icon-btn edit-btn" onClick={() => handleEditOpen(task, 'task')}>✎</button>
                            <button className="icon-btn delete-btn" onClick={() => handleDeleteTask(task.id)}>🗑</button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Review Modal Overlay */}
          {
            status === 'preview' && (
              <div className="review-overlay">
                <div className="review-modal">
                  <div className="review-header">
                    <div className="header-top">
                      <h2>Review Events</h2>
                      <button onClick={handleCloseReview} className="close-btn">✕</button>
                    </div>
                    <p className="sub-header">{candidates.length} events created</p>
                  </div>

                  <div className="review-body">
                    {candidates.map((candidate) => (
                      <div key={candidate.id} className={`review-item-card ${candidate.command_type === 'AMBIGUITY' ? 'ambiguity-item' : ''}`}>
                        {/* Event Title */}
                        <h3 className="event-title">
                          {candidate.parameters?.title && candidate.parameters.title !== 'CREATE_TASK'
                            ? candidate.parameters.title
                            : (candidate.description !== 'CREATE_TASK' ? candidate.description : 'New Event')}
                        </h3>

                        {/* Event Details */}
                        <div className="event-details">
                          <div className="detail-row">
                            <span className="detail-icon">📅</span>
                            <span className="detail-text">
                              {(() => {
                                const startStr = candidate.parameters.start_time || (() => {
                                  try { return JSON.parse(candidate.parameters.options?.[0]?.value || '{}').start_time } catch (e) { }
                                })();
                                if (!startStr) return 'No date';

                                const startDt = new Date(normalizeToUTC(startStr));
                                const endStr = candidate.parameters.end_time;

                                if (endStr) {
                                  const endDt = new Date(normalizeToUTC(endStr));
                                  if (startDt.toDateString() !== endDt.toDateString()) {
                                    return `${startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                                  }
                                }

                                return startDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                              })()}
                            </span>
                          </div>
                          {(!candidate.parameters.start_time && candidate.command_type === 'AMBIGUITY') ? null : (
                            <div className="detail-row">
                              <span className="detail-icon">🕒</span>
                              <span className="detail-text">
                                {candidate.parameters.start_time ? (
                                  <>
                                    {formatToLocalTime(normalizeToUTC(candidate.parameters.start_time), preferences?.time_format_24h)}
                                    {candidate.parameters.end_time && (() => {
                                      const startDt = new Date(normalizeToUTC(candidate.parameters.start_time));
                                      const endDt = new Date(normalizeToUTC(candidate.parameters.end_time));
                                      const isDiffDay = startDt.toDateString() !== endDt.toDateString();
                                      const timeStr = formatToLocalTime(normalizeToUTC(candidate.parameters.end_time), preferences?.time_format_24h);


                                      return (
                                        <> - {timeStr}</>
                                      );
                                    })()}
                                  </>
                                ) : 'No time'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Content Area (Ambiguity OR Actions) */}
                        {candidate.command_type === 'AMBIGUITY' ? (
                          <div className="ambiguity-content">
                            <h4>
                              {candidate.parameters.type === 'conflict' && candidate.parameters.existing_start_time
                                ? (candidate.parameters.existing_end_time
                                  ? `'${candidate.parameters.title}' conflicts with '${candidate.parameters.existing_title}' (${formatToLocalTime(normalizeToUTC(candidate.parameters.existing_start_time), preferences?.time_format_24h)} - ${formatToLocalTime(normalizeToUTC(candidate.parameters.existing_end_time), preferences?.time_format_24h)}). What would you like to do?`
                                  : `'${candidate.parameters.title}' conflicts with '${candidate.parameters.existing_title}' at ${formatToLocalTime(normalizeToUTC(candidate.parameters.existing_start_time), preferences?.time_format_24h)}. What would you like to do?`)
                                : candidate.parameters.message}
                            </h4>
                            <div className="ambiguity-opts">
                              {candidate.parameters.options?.map((opt, i) => {
                                let label = opt.label;
                                let btnClass = "ambiguity-btn";
                                let val = {};

                                try { val = JSON.parse(opt.value) } catch (e) { }

                                if (opt.suggested || val.suggested) {
                                  btnClass += " btn-icon-suggested";
                                  const startStr = formatToLocalTime(normalizeToUTC(opt.display_time || val.start_time), preferences?.time_format_24h);
                                  const endStr = (opt.end_time || val.end_time) ? formatToLocalTime(normalizeToUTC(opt.end_time || val.end_time), preferences?.time_format_24h) : '';
                                  label = `Suggested: ${startStr}${endStr ? ' - ' + endStr : ''}`;
                                } else if (val.discard) {
                                  label = "Discard New Task";
                                  btnClass += " btn-icon-discard";
                                } else if (val.keep_both) {
                                  label = "Manual Adjustment";
                                  btnClass += " btn-icon-manual";
                                } else if (val.remove_task_id || val.remove_candidate_id) {
                                  label = `Replace Existing`;
                                  btnClass += " btn-icon-replace";
                                }

                                if (!(opt.suggested || val.suggested)) {
                                  if (label.includes('AM')) btnClass += " btn-icon-am";
                                  else if (label.includes('PM')) btnClass += " btn-icon-pm";
                                }
                                if (label.toLowerCase().includes('reject')) btnClass += " btn-icon-discard";

                                return (
                                  <button key={i} className={btnClass} onClick={async () => {

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

                                      let removeId = null;
                                      let isExistingCandidate = false;
                                      if (replaceOption) {
                                        try {
                                          const parsed = JSON.parse(replaceOption.value);
                                          removeId = parsed.remove_task_id || parsed.remove_candidate_id;
                                          isExistingCandidate = !!parsed.remove_candidate_id;
                                        } catch (e) { }
                                      }

                                      // Manual Adjustment Flow
                                      let existingTask = null;
                                      if (removeId && !isExistingCandidate) {
                                        // Try local find first
                                        existingTask = calendarTasks.find(t => t.id === removeId);
                                        if (!existingTask) {
                                          try { existingTask = await jobService.getTask(removeId); } catch (e) { }
                                        }
                                      }

                                      if (!existingTask && candidate.parameters.existing_start_time) {
                                        existingTask = {
                                          id: removeId,
                                          title: candidate.parameters.existing_title,
                                          start_time: candidate.parameters.existing_start_time,
                                          end_time: candidate.parameters.existing_end_time,
                                          isCandidate: isExistingCandidate
                                        };
                                      }

                                      const newTaskTime = (val.start_time || candidate.parameters.start_time)
                                        ? formatToLocalTime(normalizeToUTC(val.start_time || candidate.parameters.start_time), preferences?.time_format_24h)
                                        : '09:00';
                                      const existingTaskTime = existingTask?.start_time
                                        ? formatToLocalTime(normalizeToUTC(existingTask.start_time), preferences?.time_format_24h)
                                        : '09:00';

                                      setConflictModal({
                                        isOpen: true,
                                        newTask: {
                                          title: val.title || candidate.parameters.title,
                                          start_time: val.start_time || candidate.parameters.start_time,
                                          end_time: val.end_time || candidate.parameters.end_time,
                                          candidateId: candidate.id
                                        },
                                        existingTask: existingTask ? {
                                          id: existingTask.id || removeId,
                                          title: existingTask.title,
                                          start_time: existingTask.start_time,
                                          end_time: existingTask.end_time,
                                          isCandidate: existingTask.isCandidate || isExistingCandidate
                                        } : null,
                                        newTaskTime,
                                        existingTaskTime,
                                        newTaskDate: val.start_time ? toLocalISOString(new Date(val.start_time)).split('T')[0] : toLocalISOString(new Date()).split('T')[0],
                                        existingTaskDate: existingTask?.start_time ? toLocalISOString(new Date(existingTask.start_time)).split('T')[0] : toLocalISOString(new Date()).split('T')[0]
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
                                  }}>
                                    <span>{label}</span>
                                  </button>
                                )
                              })}
                              <div style={{ flex: 1 }}></div>
                              {/* Only show generic Reject if no explicit 'Discard' option exists */}
                              {!candidate.parameters.options?.some(opt => {
                                try { return JSON.parse(opt.value).discard; } catch { return false; }
                              }) && (
                                  <button className="ambiguity-reject-btn" onClick={() => {
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
                                )}
                            </div>
                          </div>
                        ) : (
                          <div className="event-actions">
                            <button className="action-btn reject-btn" onClick={() => {
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
                            }}>
                              <X size={16} /> <span>Reject</span>
                            </button>
                            <button className="action-btn edit-btn-neutral" onClick={() => handleEditOpen(candidate, 'candidate')}>
                              <Edit3 size={16} /> <span>Edit</span>
                            </button>
                            <button className="action-btn accept-btn" onClick={() => finalizeAcceptance(candidate.id)}>
                              <Check size={16} /> <span>Accept</span>
                            </button>
                          </div>
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
          {
            conflictModal.isOpen && (
              <div className="review-overlay">
                <div className="conflict-modal">
                  <div className="conflict-header">
                    <h2>Resolve Time Conflict</h2>
                  </div>
                  <p className="conflict-subtext">Adjust the times for these overlapping events:</p>

                  <div className="conflict-tasks">
                    {/* New Task */}
                    <div className="conflict-task-card new-task">
                      <div className="task-badge new">New</div>
                      <h4>{conflictModal.newTask?.title || 'New Task'}</h4>

                      {/* Suggestion Button */}
                      {conflictModal.suggestion && (
                        <button
                          className="suggestion-btn"
                          onClick={() => {
                            const s = conflictModal.suggestion;
                            const localStart = formatToLocalTime(normalizeToUTC(s.start_time));
                            const localDate = normalizeToUTC(s.start_time).split('T')[0];
                            setConflictModal(prev => ({
                              ...prev,
                              newTaskTime: localStart,
                              newTaskDate: localDate
                            }));
                          }}
                        >
                          <span style={{ marginRight: '4px' }}>✨</span>
                          Suggested: {formatToLocalTime(normalizeToUTC(conflictModal.suggestion.start_time))} - {formatToLocalTime(normalizeToUTC(conflictModal.suggestion.end_time))}
                        </button>
                      )}

                      <div className="edit-time-container attention-sparkle">
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
                                  const { time, date } = handleTimeShift(conflictModal.newTaskTime, 30, conflictModal.newTaskDate);
                                  setConflictModal(prev => ({ ...prev, newTaskTime: time, newTaskDate: date }));
                                }}>▲</button>
                                <button className="arrow-btn" onClick={() => {
                                  const { time, date } = handleTimeShift(conflictModal.newTaskTime, -30, conflictModal.newTaskDate);
                                  setConflictModal(prev => ({ ...prev, newTaskTime: time, newTaskDate: date }));
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
                        <div className="edit-time-container attention-sparkle">
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
                                    const { time, date } = handleTimeShift(conflictModal.existingTaskTime, 30, conflictModal.existingTaskDate);
                                    setConflictModal(prev => ({ ...prev, existingTaskTime: time, existingTaskDate: date }));
                                  }}>▲</button>
                                  <button className="arrow-btn" onClick={() => {
                                    const { time, date } = handleTimeShift(conflictModal.existingTaskTime, -30, conflictModal.existingTaskDate);
                                    setConflictModal(prev => ({ ...prev, existingTaskTime: time, existingTaskDate: date }));
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

          {/* Search Modal */}
          {searchModal.isOpen && (
            <div className="modal-overlay" onClick={handleSearchClose}>
              <div className="search-modal" onClick={(e) => e.stopPropagation()}>
                <div className="search-header">
                  <h3>Search Events</h3>
                  <button className="close-btn" onClick={handleSearchClose}>×</button>
                </div>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by event title..."
                  value={searchModal.query}
                  onChange={(e) => handleSearchQuery(e.target.value)}
                  autoFocus
                />
                <div className="search-results">
                  {searchModal.query && searchModal.results.length === 0 && (
                    <p className="no-results">No events found</p>
                  )}
                  {searchModal.results.map(task => {
                    const startDate = new Date(normalizeToUTC(task.start_time));
                    const endDate = new Date(normalizeToUTC(task.end_time));
                    const startDateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const endDateStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const isMultiDay = startDateStr !== endDateStr;

                    return (
                      <div
                        key={task.id}
                        className="search-result-item"
                        onClick={() => handleSelectSearchResult(task)}
                      >
                        <div className="result-title">{task.title}</div>
                        <div className="result-date">
                          {isMultiDay ? (
                            <>
                              {startDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              })} {formatToLocalTime(task.start_time)}
                              {' → '}
                              {endDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              })} {formatToLocalTime(task.end_time)}
                            </>
                          ) : (
                            <>
                              {startDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              })} at {formatToLocalTime(task.start_time)}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activePage === 'preferences' && (
        <div className="preferences-top-container">
          <PreferencesPage
            isPage={true}
            preferences={preferences}
            setPreferences={setPreferences}
          />
        </div>
      )}

      {activePage === 'templates' && (
        <TemplatesPage onSelectTemplate={handleSelectTemplate} />
      )}
    </>
  )
}

export default App
