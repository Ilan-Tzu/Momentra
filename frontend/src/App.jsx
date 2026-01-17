import { useState } from 'react'
import { jobService } from './services/api'
import './App.css'

function App() {
  const [status, setStatus] = useState('input') // input, loading, preview, success, error
  const [rawText, setRawText] = useState('')
  const [jobId, setJobId] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [parsedJob, setParsedJob] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Editing state
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const handleParse = async () => {
    if (!rawText.trim()) return;
    setStatus('loading');
    setErrorMsg('');

    try {
      // 1. Create Job
      const job = await jobService.createJob(rawText);
      setJobId(job.id);

      // 2. Parse Job
      await jobService.parseJob(job.id);

      // 3. Get Preview
      await refreshPreview(job.id);

    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to process request. Please try again.');
      setStatus('input'); // allow retry
    }
  }

  const refreshPreview = async (id) => {
    const preview = await jobService.getJob(id);
    setParsedJob(preview);
    setCandidates(preview.candidates);
    setStatus('preview');
  }

  const handleAccept = async () => {
    if (!jobId) return;
    setStatus('loading');
    try {
      // Accept all candidates for now (or filter selected)
      const allIds = candidates.map(c => c.id);
      await jobService.acceptJob(jobId, allIds);
      setStatus('success');
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to save to calendar.');
      setStatus('preview');
    }
  }

  const startEditing = (candidate) => {
    setEditingId(candidate.id);
    // Deep copy parameters to avoid mutating state directly
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
      // Optimistic update or wait for server? Let's wait.
      await jobService.updateJobCandidate(editingId, {
        description: editForm.description,
        parameters: editForm.parameters
      });
      await refreshPreview(jobId);
      setEditingId(null);
    } catch (err) {
      console.error("Failed to update candidate", err);
      // alert("Failed to save changes");
    }
  }

  const updateEditField = (field, value) => {
    // If updating top-level description
    if (field === 'description') {
      setEditForm(prev => ({ ...prev, description: value }));
    } else {
      // Assume parameter update
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
    setParsedJob(null);
    setStatus('input');
    setEditingId(null);
  }

  return (
    <div className="container">
      <header>
        <h1>Momentra AI Calendar</h1>
        <p>Type your plans naturally, and we'll handle the rest.</p>
      </header>

      <main className="card">
        {status === 'input' && (
          <div className="input-section">
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="e.g. Lunch with Mom tomorrow at 12..."
              rows={4}
            />
            <div className="actions">
              <button
                onClick={handleParse}
                className="primary-btn"
                disabled={!rawText.trim()}
              >
                Parse Schedule
              </button>
            </div>
            {errorMsg && <p className="error">{errorMsg}</p>}
          </div>
        )}

        {status === 'loading' && (
          <div className="loading-section">
            <div className="spinner"></div>
            <p>Processing your schedule...</p>
          </div>
        )}

        {status === 'preview' && (
          <div className="preview-section">
            <h2>Review Candidates</h2>
            {candidates.length === 0 ? (
              <p className="empty-state">No tasks found. Try being more specific.</p>
            ) : (
              <div className="candidates-list">
                {candidates.map(candidate => (
                  <div key={candidate.id} className={`candidate-item ${candidate.command_type.toLowerCase()}`}>

                    {/* Render different view if editing */}
                    {editingId === candidate.id ? (
                      <div className="edit-mode">
                        <input
                          className="edit-input title-input"
                          value={editForm.parameters.title || editForm.description}
                          onChange={(e) => {
                            updateEditField('title', e.target.value);
                            updateEditField('description', e.target.value); // Sync for now
                          }}
                          placeholder="Task Title"
                        />
                        {candidate.command_type === 'CREATE_TASK' && (
                          <div className="time-inputs">
                            <input
                              className="edit-input"
                              type="datetime-local"
                              value={editForm.parameters.start_time ? editForm.parameters.start_time.slice(0, 16) : ''}
                              onChange={(e) => updateEditField('start_time', e.target.value)}
                            />
                            <span>to</span>
                            <input
                              className="edit-input"
                              type="datetime-local"
                              value={editForm.parameters.end_time ? editForm.parameters.end_time.slice(0, 16) : ''}
                              onChange={(e) => updateEditField('end_time', e.target.value)}
                            />
                          </div>
                        )}
                        <div className="edit-actions">
                          <button onClick={saveEditing} className="save-btn">Save</button>
                          <button onClick={cancelEditing} className="cancel-btn">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      // Normal View
                      <>
                        <div className="candidate-icon">
                          {candidate.command_type === 'AMBIGUITY' ? '❓' : '📅'}
                        </div>
                        <div className="candidate-details">
                          <h3>{candidate.description}</h3>
                          {candidate.command_type === 'CREATE_TASK' && (
                            <span className="time-badge">
                              {candidate.parameters.start_time ? new Date(candidate.parameters.start_time).toLocaleString() : 'No time set'}
                            </span>
                          )}
                          {candidate.command_type === 'AMBIGUITY' && (
                            <>
                              <p className="ambiguity-msg">{candidate.parameters.message}</p>
                              {candidate.parameters.options && candidate.parameters.options.length > 0 && (
                                <div className="ambiguity-options">
                                  {candidate.parameters.options.map((opt, idx) => (
                                    <button
                                      key={idx}
                                      className="option-btn"
                                      onClick={() => {
                                        // Parse value JSON
                                        let values = {};
                                        try { values = JSON.parse(opt.value); } catch (e) { console.error(e); }

                                        // Apply updates: Change title if needed, apply time params
                                        // And VERY IMPORTANT: Change message to the new title effectively converting it to a task visually
                                        // In reality we patch the candidate

                                        const newTitle = values.title || candidate.description.replace('Ambiguity: ', 'Task: ');

                                        // Direct Patch with type switch
                                        jobService.updateJobCandidate(candidate.id, {
                                          description: newTitle,
                                          command_type: 'CREATE_TASK',
                                          parameters: {
                                            ...candidate.parameters,
                                            ...values,
                                          }
                                        }).then(() => refreshPreview(jobId));
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="item-actions">
                          <button onClick={() => startEditing(candidate)} className="icon-btn edit-btn" title="Edit">
                            ✏️
                          </button>
                          <button onClick={() => {
                            if (window.confirm("Delete this task?")) {
                              jobService.deleteJobCandidate(candidate.id).then(() => refreshPreview(jobId));
                            }
                          }} className="icon-btn delete-btn" title="Delete">
                            🗑️
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="actions">
              <button onClick={reset} className="secondary-btn">Cancel</button>
              <button onClick={handleAccept} className="primary-btn">
                Add to Calendar
              </button>
            </div>
            {errorMsg && <p className="error">{errorMsg}</p>}
          </div>
        )}

        {status === 'success' && (
          <div className="success-section">
            <div className="success-icon">✅</div>
            <h2>Success!</h2>
            <p>Your tasks have been added to the calendar.</p>
            <button onClick={reset} className="primary-btn">Add Another</button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
