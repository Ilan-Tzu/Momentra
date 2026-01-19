import React, { useState, useEffect } from 'react';
import { formatToLocalTime, toLocalISOString, normalizeToUTC, handleTimeShift, toUTC } from '../utils/dateUtils';
import '../App.css'; // Reusing existing styles for arrows/inputs

const EditEventModal = ({ isOpen, onClose, onSave, event, type = 'task' }) => {
    const [form, setForm] = useState({
        title: '',
        description: '',
        start_date: '',
        start_time: '',
        end_date: '',
        end_time: ''
    });

    useEffect(() => {
        if (isOpen && event) {
            // Initialize form from event logic
            let startTimeIso, endTimeIso, title, description;

            if (type === 'task') {
                startTimeIso = normalizeToUTC(event.start_time);
                endTimeIso = normalizeToUTC(event.end_time);
                title = event.title;
                description = event.description || '';
            } else {
                // Candidate
                startTimeIso = normalizeToUTC(event.parameters.start_time);
                endTimeIso = normalizeToUTC(event.parameters.end_time);
                title = event.parameters.title || event.description; // Fallback
                description = event.parameters.description || event.description || '';
            }

            // Default to now if missing
            const startDateObj = startTimeIso ? new Date(startTimeIso) : new Date();
            const endDateObj = endTimeIso ? new Date(endTimeIso) : new Date(startDateObj.getTime() + 30 * 60000);

            const startLocal = toLocalISOString(startDateObj);
            const endLocal = toLocalISOString(endDateObj);

            setForm({
                title,
                description,
                start_date: startLocal.split('T')[0],
                start_time: startLocal.split('T')[1].substring(0, 5), // "HH:MM"
                end_date: endLocal.split('T')[0],
                end_time: endLocal.split('T')[1].substring(0, 5)
            });
        }
    }, [isOpen, event, type]);

    if (!isOpen) return null;

    const updateField = (field, value) => {
        setForm(prev => {
            const next = { ...prev, [field]: value };

            // If we are changing start, we shift end to keep duration
            if (field === 'start_time' || field === 'start_date') {
                const oldStart = new Date(`${prev.start_date}T${prev.start_time}`);
                const oldEnd = new Date(`${prev.end_date}T${prev.end_time}`);
                const durationMs = oldEnd.getTime() - oldStart.getTime();

                const newStart = new Date(`${next.start_date}T${next.start_time}`);
                if (!isNaN(newStart.getTime()) && !isNaN(durationMs)) {
                    const newEnd = new Date(newStart.getTime() + durationMs);
                    const localISO = toLocalISOString(newEnd);
                    next.end_date = localISO.split('T')[0];
                    next.end_time = localISO.split('T')[1].substring(0, 5);
                }
            }
            return next;
        });
    };

    const handleShift = (field, delta) => {
        const current = form[field];
        const shifted = handleTimeShift(current, delta);
        updateField(field, shifted);
    };

    const handleSaveClick = () => {
        // Construct merged ISO strings
        const startIso = `${form.start_date}T${form.start_time}`;
        const endIso = `${form.end_date}T${form.end_time}`;

        const startObj = new Date(startIso);
        const endObj = new Date(endIso);

        // Validate valid dates
        if (isNaN(startObj.getTime())) {
            alert("Invalid Start Date/Time");
            return;
        }
        if (isNaN(endObj.getTime())) {
            alert("Invalid End Date/Time");
            return;
        }

        // Ensure End > Start
        if (endObj <= startObj) {
            alert("End time must be after start time.");
            return;
        }

        onSave({
            ...event,
            title: form.title,
            description: form.description,
            start_time: startIso, // Local ISO "YYYY-MM-DDTHH:MM"
            end_time: endIso      // Local ISO
        });
    };

    return (
        <div className="edit-event-overlay">
            <div className="edit-event-modal">
                <div className="edit-event-header">
                    <h2>Edit {type === 'task' ? 'Event' : 'Candidate'}</h2>
                    <button onClick={onClose} className="close-btn">✕</button>
                </div>

                <div className="edit-event-body">
                    <div className="input-group">
                        <label className="input-label">Title</label>
                        <input
                            className="edit-field"
                            value={form.title}
                            onChange={e => updateField('title', e.target.value)}
                        />
                    </div>

                    <div className="edit-time-container attention-sparkle">
                        {/* START */}
                        <div className="edit-time-row-split">
                            <label>Start</label>
                            <div className="split-inputs">
                                <input
                                    type="date"
                                    className="edit-field date-input"
                                    value={form.start_date}
                                    onChange={e => updateField('start_date', e.target.value)}
                                />
                                <div className="time-control-group">
                                    <div className="arrow-stack">
                                        <button className="arrow-btn" onClick={() => handleShift('start_time', 30)}>▲</button>
                                        <button className="arrow-btn" onClick={() => handleShift('start_time', -30)}>▼</button>
                                    </div>
                                    <input
                                        type="time"
                                        className="edit-field time-input"
                                        value={form.start_time}
                                        onChange={e => updateField('start_time', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* END */}
                        <div className="edit-time-row-split">
                            <label>End</label>
                            <div className="split-inputs">
                                <input
                                    type="date"
                                    className="edit-field date-input"
                                    value={form.end_date}
                                    onChange={e => updateField('end_date', e.target.value)}
                                />
                                <div className="time-control-group">
                                    <div className="arrow-stack">
                                        <button className="arrow-btn" onClick={() => handleShift('end_time', 30)}>▲</button>
                                        <button className="arrow-btn" onClick={() => handleShift('end_time', -30)}>▼</button>
                                    </div>
                                    <input
                                        type="time"
                                        className="edit-field time-input"
                                        value={form.end_time}
                                        onChange={e => updateField('end_time', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Description</label>
                        <textarea
                            className="edit-field"
                            rows={3}
                            value={form.description}
                            onChange={e => updateField('description', e.target.value)}
                        />
                    </div>
                </div>

                <div className="edit-event-footer">
                    <button className="edit-cancel-btn" onClick={onClose}>Cancel</button>
                    <button className="edit-save-btn" onClick={handleSaveClick}>Save Changes</button>
                </div>
            </div>
        </div>
    );
};

export default EditEventModal;
