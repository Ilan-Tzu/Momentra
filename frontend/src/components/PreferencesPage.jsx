import React, { useState, useEffect, useRef } from 'react';
import './PreferencesPage.css';
import { jobService } from '../services/api';
import { Clock, Sun, Moon, Hourglass, Zap, Brain, Calendar, Type } from 'lucide-react';

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
                <div className="header-left">
                    <h2>Preferences</h2>
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

                <div className="header-right">
                    {!isPage && <button className="close-btn" onClick={onClose}>×</button>}
                </div>
            </div>

            <div className="preferences-body">
                {activeTab === 'scheduling' && (
                    <div className="settings-section">
                        <div className="setting-item">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Clock size={20} className="setting-icon" />
                                    <span className="label-text">Buffer Time</span>
                                </div>
                                <span className="label-value">{preferences?.buffer_minutes ?? 15} min</span>
                            </div>
                            <div className="setting-control">
                                <input
                                    type="range"
                                    min="5"
                                    max="60"
                                    step="5"
                                    value={preferences?.buffer_minutes ?? 15}
                                    onChange={(e) => updatePreference('buffer_minutes', parseInt(e.target.value))}
                                />
                                <div className="range-labels">
                                    <span>5m</span>
                                    <span>60m</span>
                                </div>
                            </div>
                        </div>

                        <div className="setting-item">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Sun size={20} className="setting-icon" />
                                    <span className="label-text">Work Start</span>
                                </div>
                                <span className="label-value">{preferences?.work_start_hour ?? 8}:00</span>
                            </div>
                            <div className="setting-control">
                                <input
                                    type="range"
                                    min="0"
                                    max="23"
                                    value={preferences?.work_start_hour ?? 8}
                                    onChange={(e) => updatePreference('work_start_hour', parseInt(e.target.value))}
                                />
                                <div className="range-labels">
                                    <span>0:00</span>
                                    <span>23:00</span>
                                </div>
                            </div>
                        </div>

                        <div className="setting-item">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Moon size={20} className="setting-icon" />
                                    <span className="label-text">Work End</span>
                                </div>
                                <span className="label-value">{preferences?.work_end_hour ?? 22}:00</span>
                            </div>
                            <div className="setting-control">
                                <input
                                    type="range"
                                    min="0"
                                    max="23"
                                    value={preferences?.work_end_hour ?? 22}
                                    onChange={(e) => updatePreference('work_end_hour', parseInt(e.target.value))}
                                />
                                <div className="range-labels">
                                    <span>0:00</span>
                                    <span>23:00</span>
                                </div>
                            </div>
                        </div>

                        <div className="setting-item">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Hourglass size={20} className="setting-icon" />
                                    <span className="label-text">Default Duration</span>
                                </div>
                            </div>
                            <div className="setting-control">
                                <select
                                    value={preferences?.default_duration_minutes ?? 60}
                                    onChange={(e) => updatePreference('default_duration_minutes', parseInt(e.target.value))}
                                >
                                    <option value={30}>30 minutes</option>
                                    <option value={60}>1 hour</option>
                                    <option value={90}>1.5 hours</option>
                                    <option value={120}>2 hours</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="settings-section">
                        <div className="setting-item">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Zap size={20} className="setting-icon" />
                                    <span className="label-text">Creativity</span>
                                </div>
                                <span className="label-value">{(preferences?.ai_temperature ?? 0).toFixed(1)}</span>
                            </div>
                            <div className="setting-control">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={preferences?.ai_temperature ?? 0}
                                    onChange={(e) => updatePreference('ai_temperature', parseFloat(e.target.value))}
                                />
                                <div className="range-labels">
                                    <span>Precise</span>
                                    <span>Creative</span>
                                </div>
                            </div>
                            <p className="setting-hint">Control how predictable or creative the AI should be.</p>
                        </div>

                        <div className="setting-item full-width">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Brain size={20} className="setting-icon" />
                                    <span className="label-text">Personal Context</span>
                                </div>
                            </div>
                            <div className="setting-control">
                                <textarea
                                    rows="6"
                                    placeholder="e.g., I'm a software engineer, I prefer mornings for deep work, I usually have lunch at 12:30..."
                                    value={preferences?.personal_context || ''}
                                    onChange={(e) => updatePreference('personal_context', e.target.value)}
                                    onBlur={(e) => updatePreference('personal_context', e.target.value)}
                                />
                            </div>
                            <p className="setting-hint">This context is added to every AI prompt to tailor the schedule to you.</p>
                        </div>
                    </div>
                )}

                {activeTab === 'display' && (
                    <div className="settings-section">
                        <div className="setting-item">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Calendar size={20} className="setting-icon" />
                                    <span className="label-text">First Day of Week</span>
                                </div>
                            </div>
                            <div className="setting-control">
                                <select
                                    value={preferences?.first_day_of_week ?? 1}
                                    onChange={(e) => updatePreference('first_day_of_week', parseInt(e.target.value))}
                                >
                                    <option value={0}>Sunday</option>
                                    <option value={1}>Monday</option>
                                </select>
                            </div>
                        </div>

                        <div className="setting-item">
                            <div className="setting-header">
                                <div className="setting-label-group">
                                    <Type size={20} className="setting-icon" />
                                    <span className="label-text">Time Format</span>
                                </div>
                            </div>
                            <div className="setting-control">
                                <div className="toggle-container">
                                    <button
                                        className={`toggle-option ${!preferences?.time_format_24h ? 'active' : ''}`}
                                        onClick={() => updatePreference('time_format_24h', false)}
                                    >
                                        12-hour
                                    </button>
                                    <button
                                        className={`toggle-option ${preferences?.time_format_24h ? 'active' : ''}`}
                                        onClick={() => updatePreference('time_format_24h', true)}
                                    >
                                        24-hour
                                    </button>
                                </div>
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
