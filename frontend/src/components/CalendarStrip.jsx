import { useMemo, useRef, useEffect } from 'react';
import { normalizeToUTC, toLocalISOString } from '../utils/dateUtils';
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
        if (!tasks || !Array.isArray(tasks)) return { singleDay: [], multiDay: [] };

        const targetDateStr = toLocalISOString(date).split('T')[0];

        const dayTasks = tasks.filter(task => {
            if (!task.start_time || !task.end_time) return false;
            try {
                // Get local dates for start/end
                const startLocal = toLocalISOString(new Date(normalizeToUTC(task.start_time))).split('T')[0];
                const endLocal = toLocalISOString(new Date(normalizeToUTC(task.end_time))).split('T')[0];

                // Check if target date is within range [start, end]
                return targetDateStr >= startLocal && targetDateStr <= endLocal;
            } catch (e) { return false; }
        });

        const singleDay = [];
        const multiDay = [];

        dayTasks.forEach(task => {
            try {
                const startDt = new Date(normalizeToUTC(task.start_time));
                const endDt = new Date(normalizeToUTC(task.end_time));

                const startLocalStr = toLocalISOString(startDt).split('T')[0];
                const endLocalStr = toLocalISOString(endDt).split('T')[0];

                if (startLocalStr === endLocalStr) {
                    singleDay.push(task);
                } else {
                    let width = 100;
                    let left = 0;

                    if (startLocalStr === targetDateStr) {
                        const startHour = startDt.getHours() + startDt.getMinutes() / 60;
                        left = (startHour / 24) * 100;
                        width = 100 - left;
                    } else if (endLocalStr === targetDateStr) {
                        const endHour = endDt.getHours() + endDt.getMinutes() / 60;
                        width = (endHour / 24) * 100;
                        left = 0;
                    }

                    multiDay.push({
                        ...task,
                        isStart: startLocalStr === targetDateStr,
                        isEnd: endLocalStr === targetDateStr,
                        isMiddle: startLocalStr < targetDateStr && endLocalStr > targetDateStr,
                        width,
                        left
                    });
                }
            } catch (e) { }
        });

        return { singleDay, multiDay };
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

                        {/* Multi-Day Task Bars */}
                        <div className="task-bars-container">
                            {dayTasks.multiDay.slice(0, 2).map((task, i) => (
                                <div
                                    key={task.id || i}
                                    className={`task-bar ${task.isStart ? 'start' : ''} ${task.isEnd ? 'end' : ''} ${task.isMiddle ? 'middle' : ''}`}
                                    style={{
                                        width: `${task.width}%`,
                                        marginLeft: `${task.left}%`
                                    }}
                                ></div>
                            ))}
                            {dayTasks.multiDay.length > 2 && <div className="task-bar-overflow"></div>}
                        </div>

                        {/* Single Day Dots */}
                        <div className="task-dots">
                            {dayTasks.singleDay.slice(0, 3).map((_, i) => (
                                <div key={i} className="dot"></div>
                            ))}
                            {dayTasks.singleDay.length > 3 && <div className="dot plus">+</div>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default CalendarStrip;
