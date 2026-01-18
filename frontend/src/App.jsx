import { useState, useEffect, useRef } from 'react'
import { jobService } from './services/api'
import CalendarStrip from './components/CalendarStrip'
import ConfirmModal from './components/ConfirmModal'
import './App.css'
import { LogOut } from 'lucide-react'

// Helper to get local ISO string (e.g. "2026-01-18T14:00:00") ignoring timezone offset
const toLocalISOString = (date) => {
  const pad = (num) => String(num).padStart(2, '0');
  return date.getFullYear() +
    '-' + pad(date.getMonth() + 1) +
    '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) +
    ':' + pad(date.getMinutes()) +
    ':' + pad(date.getSeconds());
};

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
      setCalendarTasks(tasks);
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
    setCandidates(preview.candidates);
    setStatus('preview');
  }

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
    setEditForm({
      description: candidate.description,
      parameters: { ...candidate.parameters }
    });
  }

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  }

  const saveEditing = async () => {
    try {
      await jobService.updateJobCandidate(editingId, {
        description: editForm.description,
        command_type: 'CREATE_TASK', // Ensure it converts to task
        parameters: editForm.parameters
      });
      await refreshPreview(jobId);
      setEditingId(null);
    } catch (err) {
      console.error("Failed to update candidate", err);
    }
  }

  const updateEditField = (field, value) => {
    if (field === 'description') {
      setEditForm(prev => ({ ...prev, description: value }));
    } else {
      setEditForm(prev => ({
        ...prev,
        parameters: { ...prev.parameters, [field]: value }
      }));
    }
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
    setTaskEditForm({
      title: task.title,
      start_time: task.start_time
    });
  }

  const cancelTaskEdit = () => {
    setTaskEditingId(null);
    setTaskEditForm({});
  }

  const saveTaskEdit = async () => {
    try {
      await jobService.updateTask(taskEditingId, taskEditForm);
      await fetchCalendarTasks();
      setTaskEditingId(null);
    } catch (e) {
      console.error("Failed to update task", e);
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

  // Auth state
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    console.log("Auth submit triggered", authMode, authUsername);
    setAuthError('');
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('Please fill in all fields');
      return;
    }

    setIsAuthLoading(true);
    try {
      if (authMode === 'register') {
        await jobService.register(authUsername, authPassword);
        // Auto login after register
        await performLogin(authUsername, authPassword);
      } else {
        await performLogin(authUsername, authPassword);
      }
    } catch (err) {
      console.error(err);
      setAuthError(authMode === 'register' ? 'Registration failed. Username may be taken.' : 'Login failed. Check credentials.');
    } finally {
      setIsAuthLoading(false);
    }
  }

  const performLogin = async (u, p) => {
    const userData = await jobService.login(u, p);
    localStorage.setItem('momentra_user', userData.username);
    setUser(userData.username);
  }

  if (!user) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>Welcome to Momentra</h1>
          <p>{authMode === 'login' ? 'Login to manage your calendar' : 'Create an account to get started'}</p>

          <form onSubmit={handleAuthSubmit}>
            <input
              className="login-input"
              placeholder="Username"
              value={authUsername}
              onChange={e => setAuthUsername(e.target.value)}
              autoFocus
              disabled={isAuthLoading}
            />
            <input
              className="login-input"
              placeholder="Password"
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              disabled={isAuthLoading}
            />

            {authError && <p className="error-msg" style={{ marginBottom: '16px' }}>{authError}</p>}

            <button type="submit" className="login-btn" disabled={isAuthLoading}>
              {isAuthLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Register')}
            </button>
          </form>

          <div style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="login-toggle-btn"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setAuthError('');
              }}
            >
              {authMode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={`container ${status === 'preview' ? 'blur-bg' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <button className="logout-btn-header" onClick={handleLogout}>Logout ({user})</button>
        </div>

        {/* Hero Section */}
        <div className="hero-section" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1>Momentra Calendar</h1>
          <p>Describe your events in natural language</p>
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
              placeholder="e.g., Team meeting tomorrow at 2pm, Dentist appointment next Monday..."
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
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 600 }}>Upcoming</h2>
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
                      value={taskEditForm.start_time ? new Date(taskEditForm.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
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

                        setTaskEditForm(prev => ({ ...prev, start_time: localIso }));
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
                      {new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
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
                          <h4>{candidate.parameters.message}</h4>
                          <div className="ambiguity-opts">
                            {candidate.parameters.options?.map((opt, i) => (
                              <button key={i} onClick={() => {
                                let val = {};
                                try { val = JSON.parse(opt.value) } catch (e) { }
                                const newTitle = val.title || candidate.description.replace('Ambiguity: ', 'Task: ');
                                jobService.updateJobCandidate(candidate.id, {
                                  description: newTitle,
                                  command_type: 'CREATE_TASK',
                                  parameters: { ...candidate.parameters, ...val }
                                }).then(() => refreshPreview(jobId));
                              }}>{opt.label}</button>
                            ))}
                            <button className="other-opt-btn" onClick={() => {
                              // Switch to edit mode, pre-fill with defaults if needed
                              // We keep it as AMBIGUITY type until saved, but the edit form will show time inputs now (see above change)
                              // Or we can auto-convert to CREATE_TASK here. Let's convert to CREATE_TASK to enable full editing.
                              jobService.updateJobCandidate(candidate.id, {
                                command_type: 'CREATE_TASK',
                                description: candidate.description.replace('Ambiguity: ', 'Task: ') // Clean up title
                              }).then(() => {
                                // After update, refresh logic usually resets candidates, but here we want to EDIT.
                                // We might need to handle this carefully. 
                                // Actually standard startEditing works on the *local* candidate. 
                                // Better: Just start editing locally. The saveEditing will send the update.
                                // But we need to ensure the LOCAL form state has the right command_type so the input shows.
                                setEditingId(candidate.id);
                                setEditForm({
                                  description: candidate.description.replace('Ambiguity: ', ''), // cleaner
                                  parameters: {
                                    ...candidate.parameters,
                                    // Default to "tomorrow 9am" or similar if empty? Or just empty.
                                    start_time: new Date().toISOString()
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
                            <span>📅 {candidate.parameters.start_time ? new Date(candidate.parameters.start_time).toLocaleDateString() : 'No date'}</span>
                            <span>🕒 {candidate.parameters.start_time ? new Date(candidate.parameters.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        </div>
                      )}

                      <div className="card-controls">
                        <button className="reject-btn" onClick={() => {
                          if (confirm("Reject this event?")) jobService.deleteJobCandidate(candidate.id).then(() => refreshPreview(jobId));
                        }}>Reject</button>

                        {candidate.command_type !== 'AMBIGUITY' && (
                          <>
                            <button className="accept-btn" onClick={async () => {
                              try {
                                await jobService.acceptJob(jobId, [candidate.id]);
                                await jobService.deleteJobCandidate(candidate.id); // Remove from candidate list
                                setCandidates(prev => prev.filter(c => c.id !== candidate.id));
                                await fetchCalendarTasks();
                                setShowToast(true);
                                setTimeout(() => setShowToast(false), 3000);
                              } catch (e) { console.error(e); }
                            }}>Accept</button>
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
              <button className="footer-reject" onClick={reset}>Reject All</button>
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
