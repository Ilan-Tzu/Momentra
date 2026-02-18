import React, { useState, useMemo, useEffect } from 'react';
import { normalizeToUTC, formatToLocalTime } from '../utils/dateUtils';
import './FullCalendarModal.css';

const FullCalendarModal = ({ isOpen, onClose, selectedDate, onSelectDate, tasks, use24HourFormat = false }) => {
    const [viewDate, setViewDate] = useState(new Date(selectedDate));
    const [hoveredDate, setHoveredDate] = useState(null);
    const [isMonthJumpOpen, setIsMonthJumpOpen] = useState(false);
    const [slideDirection, setSlideDirection] = useState('');

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Sync view date with selected date when opening
    useEffect(() => {
        if (isOpen) {
            setViewDate(new Date(selectedDate));
            setHoveredDate(selectedDate);
            setSlideDirection('fade');
        }
    }, [isOpen, selectedDate]);

    const calendarGrid = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const prevMonthLastDay = new Date(year, month, 0).getDate();
        const paddingStart = [];
        for (let i = firstDayOfMonth - 1; i >= 0; i--) {
            paddingStart.push({
                day: prevMonthLastDay - i,
                month: month - 1,
                year,
                isCurrentMonth: false
            });
        }

        const currentMonthDays = [];
        for (let i = 1; i <= daysInMonth; i++) {
            currentMonthDays.push({
                day: i,
                month,
                year,
                isCurrentMonth: true
            });
        }

        const totalCells = 42;
        const paddingEnd = [];
        const remaining = totalCells - (paddingStart.length + currentMonthDays.length);
        for (let i = 1; i <= remaining; i++) {
            paddingEnd.push({
                day: i,
                month: month + 1,
                year,
                isCurrentMonth: false
            });
        }

        return [...paddingStart, ...currentMonthDays, ...paddingEnd];
    }, [viewDate]);

    const getDayTasks = (day, month, year) => {
        if (!tasks) return [];
        const dateStr = new Date(year, month, day).toDateString();
        return tasks.filter(t => {
            if (!t.start_time) return false;
            return new Date(normalizeToUTC(t.start_time)).toDateString() === dateStr;
        });
    };

    const changeMonth = (offset) => {
        setSlideDirection(offset > 0 ? 'slide-left' : 'slide-right');
        setTimeout(() => {
            const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
            setViewDate(newDate);
        }, 10);
    };

    const jumpToMonth = (monthIdx) => {
        setSlideDirection('zoom');
        setViewDate(new Date(viewDate.getFullYear(), monthIdx, 1));
        setIsMonthJumpOpen(false);
    };

    if (!isOpen) return null;

    const today = new Date();
    const previewTasks = hoveredDate ? getDayTasks(hoveredDate.getDate(), hoveredDate.getMonth(), hoveredDate.getFullYear()) : [];

    return (
        <div className="calendar-modal-overlay" onClick={onClose}>
            <div className={`calendar-modal-content ${isMonthJumpOpen ? 'compact' : ''}`} onClick={e => e.stopPropagation()}>

                {/* Month Jump Grid Overlay */}
                {isMonthJumpOpen && (
                    <div className="month-jump-grid">
                        <div className="jump-header">
                            <h3>Select Month</h3>
                            <button className="jump-back-btn" onClick={() => setIsMonthJumpOpen(false)}>Back</button>
                        </div>
                        <div className="month-grid">
                            {monthNames.map((name, idx) => (
                                <button
                                    key={name}
                                    className={`month-jump-btn ${viewDate.getMonth() === idx ? 'active' : ''}`}
                                    onClick={() => jumpToMonth(idx)}
                                >
                                    {name.substring(0, 3)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="calendar-modal-header">
                    <h2 onClick={() => setIsMonthJumpOpen(true)} className="clickable-month">
                        {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                        <span className="expand-indicator">▿</span>
                    </h2>

                    <div className="calendar-nav-group">
                        <button className="month-nav-btn" onClick={() => changeMonth(-1)}>‹</button>
                        <button className="month-nav-btn" onClick={() => changeMonth(1)}>›</button>
                        <button className="modal-close-btn" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="calendar-modal-grid-header">
                    {daysOfWeek.map(day => <span key={day}>{day}</span>)}
                </div>

                <div
                    key={viewDate.getMonth() + '-' + viewDate.getFullYear()}
                    className={`calendar-modal-grid ${slideDirection}`}
                >
                    {calendarGrid.map((cell, idx) => {
                        const cellDate = new Date(cell.year, cell.month, cell.day);
                        const isSelected = selectedDate.toDateString() === cellDate.toDateString();
                        const isHovered = hoveredDate?.toDateString() === cellDate.toDateString();
                        const isCurrentToday = today.toDateString() === cellDate.toDateString();
                        const dayTasks = getDayTasks(cell.day, cell.month, cell.year);
                        const eventCount = dayTasks.length;

                        let busyClass = '';
                        if (eventCount > 0) {
                            if (eventCount >= 5) busyClass = 'busy-intense';
                            else if (eventCount >= 3) busyClass = 'busy-medium';
                            else busyClass = 'busy-light';
                        }

                        return (
                            <button
                                key={idx}
                                className={`calendar-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isCurrentToday ? 'today' : ''} ${busyClass}`}
                                onMouseEnter={() => setHoveredDate(cellDate)}
                                onClick={() => {
                                    onSelectDate(cellDate);
                                    onClose();
                                }}
                            >
                                <span className="cell-day">{cell.day}</span>
                                {eventCount > 0 && (
                                    <div className="cell-event-dots">
                                        {dayTasks.slice(0, 3).map((t, i) => (
                                            <span
                                                key={i}
                                                className="event-dot"
                                                style={{ background: t.color?.gradient || '#A78BFA' }}
                                            ></span>
                                        ))}
                                        {eventCount > 3 && <span className="event-dot-plus">+</span>}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Mini-Day Preview Section */}
                <div className="day-preview-panel">
                    <div className="preview-header">
                        <h4>{hoveredDate?.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} Schedule</h4>
                        <span className="preview-count">{previewTasks.length} {previewTasks.length === 1 ? 'task' : 'tasks'}</span>
                    </div>
                    <div className="preview-list">
                        {previewTasks.length > 0 ? (
                            previewTasks.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).map((t, i) => (
                                <div key={i} className="preview-item">
                                    <span className="preview-time">{formatToLocalTime(normalizeToUTC(t.start_time), use24HourFormat)}</span>
                                    <span className="preview-title" style={{ color: t.color?.gradient?.includes('linear') ? '#FFF' : t.color?.gradient }}>{t.title}</span>
                                </div>
                            ))
                        ) : (
                            <div className="preview-empty">No events scheduled</div>
                        )}
                    </div>
                </div>

                <div className="calendar-modal-footer">
                    <button className="today-jump-btn" onClick={() => {
                        const now = new Date();
                        onSelectDate(now);
                        onClose();
                    }}>Jump to Today</button>
                </div>
            </div>
        </div>
    );
};

export default FullCalendarModal;
