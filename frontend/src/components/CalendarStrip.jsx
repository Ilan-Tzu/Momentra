import { useMemo, useRef, useEffect } from 'react';
import { normalizeToUTC } from '../utils/dateUtils';
import './CalendarStrip.css';

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const CalendarStrip = ({ tasks, selectedDate, onSelectDate }) => {
    const scrollRef = useRef(null);

    // Generate next 30 days
    const scrollableDates = useMemo(() => {
        const dates = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today

        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(date);
        }
        return dates;
    }, []);

    // Center the selected date and initialization
    useEffect(() => {
        if (scrollRef.current) {
            const selectedStr = selectedDate.toDateString();
            const selectedIndex = scrollableDates.findIndex(d => d.toDateString() === selectedStr);

            if (selectedIndex !== -1) {
                const selectedElement = scrollRef.current.children[selectedIndex];
                if (selectedElement) {
                    selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        }
    }, [selectedDate, scrollableDates]);

    // Enable horizontal scrolling with mouse wheel
    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            const onWheel = (e) => {
                if (e.deltaY === 0) return;
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            };
            el.addEventListener('wheel', onWheel, { passive: false });
            return () => el.removeEventListener('wheel', onWheel);
        }
    }, []);

    // Helper to check if task is on a specific day
    const getTasksForDate = (date) => {
        if (!tasks || !Array.isArray(tasks)) return [];
        return tasks.filter(task => {
            if (!task.start_time) return false;
            try {
                // Treat start_time as UTC (append Z if missing)
                const st = normalizeToUTC(task.start_time);
                const t = new Date(st);
                return t.toDateString() === date.toDateString();
            } catch (e) { return false; }
        });
    };

    return (
        <div className="calendar-strip" ref={scrollRef}>
            {scrollableDates.map((date, index) => {
                const isSelected = selectedDate.toDateString() === date.toDateString();
                const isToday = new Date().toDateString() === date.toDateString();
                const dayTasks = getTasksForDate(date);

                return (
                    <button
                        key={index}
                        onClick={() => onSelectDate(date)}
                        className={`calendar-day-btn ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                    >
                        <span className="day-name">{daysOfWeek[date.getDay()]}</span>
                        <span className="day-number">{date.getDate()}</span>
                        <span className="month-name">{monthNames[date.getMonth()].substring(0, 3)}</span>

                        {/* Hover glow effect (simulated via CSS) */}

                        <div className="task-dots">
                            {dayTasks.slice(0, 3).map((_, i) => (
                                <div key={i} className="dot"></div>
                            ))}
                            {dayTasks.length > 3 && <div className="dot plus">+</div>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default CalendarStrip;
