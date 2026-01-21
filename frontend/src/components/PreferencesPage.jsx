import React, { useState, useEffect, useRef } from 'react';
import './PreferencesPage.css';
import { jobService } from '../services/api';

function PreferencesPage({ onClose, isPage = false, preferences, setPreferences }) {
    const [activeTab, setActiveTab] = useState('scheduling');
    const [loading, setLoading] = useState(!preferences);
    const [saveStatus, setSaveStatus] = useState('');

    const [errorMessage, setErrorMessage] = useState(null);

    // Refs for debouncing
    const saveTimeoutRef = useRef(null);
    const pendingChangesRef = useRef({});

    useEffect(() => {
        if (!preferences) {
            fetchPreferences();
        } else {
            setLoading(false);
        }
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    const fetchPreferences = async () => {
        setErrorMessage(null);
        try {
            const data = await jobService.getPreferences();
            setPreferences(data);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch preferences:', error);
            setErrorMessage('Unavailable: Failed to load preferences.');
            setLoading(false);
        }
    };

    // Optimistic update + Debounced Batch Save
    const updatePreference = (field, value) => {
        // 1. Update UI immediately
        setPreferences(prev => ({
            ...prev,
            [field]: value
        }));

        // 2. Queue the change
        pendingChangesRef.current[field] = value;
        setSaveStatus('saving');
        setErrorMessage(null);

        // 3. Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // 4. Set new timeout to save ALL pending changes
        saveTimeoutRef.current = setTimeout(async () => {
            const changesToSave = { ...pendingChangesRef.current };
            pendingChangesRef.current = {}; // Clear queue

            try {
                await jobService.updatePreferences(changesToSave);

                setSaveStatus('saved');
                setTimeout(() => setSaveStatus(''), 2000);
            } catch (error) {
                console.error('Failed to update preference:', error);
                setSaveStatus('error');
                setErrorMessage('Changes unsaved. Please retry or refresh.');
            }
        }, 500); // 500ms debounce
    };

    if (loading) {
        return (
            <div className={isPage ? "preferences-page" : "preferences-modal"}>
                <div className="preferences-content">
                    <div className="loading">Loading configurations...</div>
                </div>
            </div>
        );
    }

    const content = (
        <>
            <div className="preferences-header">
                <h2>Preferences</h2>
                {!isPage && <button className="close-btn" onClick={onClose}>×</button>}
            </div>

            <div className="preferences-tabs">
                <button
                    className={`tab ${activeTab === 'scheduling' ? 'active' : ''}`}
                    onClick={() => setActiveTab('scheduling')}
                >
                    Scheduling
                </button>
                <button
                    className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ai')}
                >
                    AI Behavior
                </button>
                <button
                    className={`tab ${activeTab === 'display' ? 'active' : ''}`}
                    onClick={() => setActiveTab('display')}
                >
                    Display
                </button>
            </div>

            <div className="preferences-body">
                {activeTab === 'scheduling' && (
                    <div className="settings-section">
                        <div className="setting-item">
                            <label>
                                <span className="label-text">Buffer Time Between Events</span>
                                <span className="label-value">{preferences?.buffer_minutes ?? 15} min</span>
                            </label>
                            <input
                                type="range"
                                min="5"
                                max="60"
                                step="5"
                                value={preferences?.buffer_minutes ?? 15}
                                onChange={(e) => updatePreference('buffer_minutes', parseInt(e.target.value))}
                            />
                        </div>

                        <div className="setting-item">
                            <label>
                                <span className="label-text">Working Hours Start</span>
                                <span className="label-value">{preferences?.work_start_hour ?? 8}:00</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="23"
                                value={preferences?.work_start_hour ?? 8}
                                onChange={(e) => updatePreference('work_start_hour', parseInt(e.target.value))}
                            />
                        </div>

                        <div className="setting-item">
                            <label>
                                <span className="label-text">Working Hours End</span>
                                <span className="label-value">{preferences?.work_end_hour ?? 22}:00</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="23"
                                value={preferences?.work_end_hour ?? 22}
                                onChange={(e) => updatePreference('work_end_hour', parseInt(e.target.value))}
                            />
                        </div>

                        <div className="setting-item">
                            <label>
                                <span className="label-text">Default Event Duration</span>
                                <span className="label-value">{preferences?.default_duration_minutes ?? 60} min</span>
                            </label>
                            <select
                                value={preferences?.default_duration_minutes ?? 60}
                                onChange={(e) => updatePreference('default_duration_minutes', parseInt(e.target.value))}
                            >
                                <option value={30}>30 min</option>
                                <option value={60}>60 min</option>
                                <option value={90}>90 min</option>
                                <option value={120}>120 min</option>
                            </select>
                        </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="settings-section">
                        <div className="setting-item">
                            <label>
                                <span className="label-text">AI Creativity Level</span>
                                <span className="label-value">{(preferences?.ai_temperature ?? 0).toFixed(1)}</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={preferences?.ai_temperature ?? 0}
                                onChange={(e) => updatePreference('ai_temperature', parseFloat(e.target.value))}
                            />
                            <p className="setting-hint">Higher values make the AI more creative and unpredictable</p>
                        </div>

                        <div className="setting-item full-width">
                            <label>
                                <span className="label-text">Personal Context</span>
                            </label>
                            <textarea
                                rows="6"
                                placeholder="e.g., I'm a software engineer, I prefer mornings for deep work, I usually have lunch at 12:30..."
                                value={preferences?.personal_context || ''}
                                onChange={(e) => updatePreference('personal_context', e.target.value)}
                                onBlur={(e) => updatePreference('personal_context', e.target.value)}
                            />
                            <p className="setting-hint">This context will be added to AI prompts to personalize suggestions</p>
                        </div>
                    </div>
                )}

                {activeTab === 'display' && (
                    <div className="settings-section">
                        <div className="setting-item">
                            <label>
                                <span className="label-text">First Day of Week</span>
                            </label>
                            <select
                                value={preferences?.first_day_of_week ?? 1}
                                onChange={(e) => updatePreference('first_day_of_week', parseInt(e.target.value))}
                            >
                                <option value={0}>Sunday</option>
                                <option value={1}>Monday</option>
                            </select>
                        </div>

                        <div className="setting-item">
                            <label>
                                <span className="label-text">Time Format</span>
                            </label>
                            <div className="toggle-container">
                                <button
                                    className={`toggle-option ${!preferences?.time_format_24h ? 'active' : ''}`}
                                    onClick={() => updatePreference('time_format_24h', false)}
                                >
                                    12-hour (2:00 PM)
                                </button>
                                <button
                                    className={`toggle-option ${preferences?.time_format_24h ? 'active' : ''}`}
                                    onClick={() => updatePreference('time_format_24h', true)}
                                >
                                    24-hour (14:00)
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {saveStatus && saveStatus !== 'error' && (
                <div className={`save-status ${saveStatus}`}>
                    {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                </div>
            )}

            {errorMessage && (
                <div className="save-status error">
                    {errorMessage}
                </div>
            )}
        </>
    );

    if (isPage) {
        return (
            <div className="preferences-page">
                <div className="preferences-content">
                    {content}
                </div>
            </div>
        );
    }

    return (
        <div className="preferences-modal" onClick={onClose}>
            <div className="preferences-content" onClick={(e) => e.stopPropagation()}>
                {content}
            </div>
        </div>
    );
}

export default PreferencesPage;
