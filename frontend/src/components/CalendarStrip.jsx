import { useMemo, useRef, useEffect } from 'react';
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

    // Scroll to today is essentially scroll to start now, so we can keep it or simplify.
    // Since today is index 0, this will just ensure it's at start.
    useEffect(() => {
        if (scrollRef.current) {
            const todayStr = new Date().toDateString();
            const todayIndex = scrollableDates.findIndex(d => d.toDateString() === todayStr);

            if (todayIndex !== -1) {
                const todayElement = scrollRef.current.children[todayIndex];
                if (todayElement) {
                    todayElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
                }
            }
        }
    }, [scrollableDates]);

    // Enable horizontal scrolling with mouse wheel (keep this UX)
    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            const onWheel = (e) => {
                if (e.deltaY === 0) return;
                e.preventDefault();
                el.scrollTo({
                    left: el.scrollLeft + e.deltaY,
                    behavior: 'smooth'
                });
            };
            el.addEventListener('wheel', onWheel);
            return () => el.removeEventListener('wheel', onWheel);
        }
    }, []);

    // Helper to check if task is on a specific day
    const getTasksForDate = (date) => {
        if (!tasks || !Array.isArray(tasks)) return [];
        return tasks.filter(task => {
            if (!task.start_time) return false;
            try {
                const t = new Date(task.start_time);
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
