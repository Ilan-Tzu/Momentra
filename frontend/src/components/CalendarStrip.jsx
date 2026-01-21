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

    // Helper to check if two Date objects are on the same local day
    const isSameDay = (d1, d2) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    // Pre-calculate "lanes" for all tasks to ensure consistent height
    const taskLanes = useMemo(() => {
        if (!tasks || !Array.isArray(tasks)) return new Map();

        // 1. Prepare all tasks that have start/end times
        const allTasks = tasks.map(task => {
            try {
                if (!task.start_time || !task.end_time) return null;
                const start = new Date(normalizeToUTC(task.start_time));
                const end = new Date(normalizeToUTC(task.end_time));
                return { ...task, start, end };
            } catch (e) { return null; }
        }).filter(Boolean);

        // 2. Sort by start time primarily, then duration (long tasks first), then ID
        allTasks.sort((a, b) => {
            if (a.start.getTime() !== b.start.getTime()) {
                return a.start - b.start;
            }
            const durA = a.end - a.start;
            const durB = b.end - b.start;
            if (durA !== durB) return durB - durA; // Longer tasks take lower lanes
            return (a.id || 0) - (b.id || 0);
        });

        // 3. Assign lanes (Greedy interval coloring)
        const lanes = [];
        const taskToLaneMap = new Map();

        allTasks.forEach(task => {
            let assigned = false;
            for (let i = 0; i < lanes.length; i++) {
                const hasOverlap = lanes[i].some(existing => {
                    // Overlap if (StartA < EndB) and (StartB < EndA)
                    return (task.start < existing.end && existing.start < task.end);
                });

                if (!hasOverlap) {
                    lanes[i].push(task);
                    taskToLaneMap.set(task.id, i);
                    assigned = true;
                    break;
                }
            }

            if (!assigned) {
                lanes.push([task]);
                taskToLaneMap.set(task.id, lanes.length - 1);
            }
        });

        return taskToLaneMap;
    }, [tasks]);

    // Calculate max lanes across ALL visible dates for consistent height
    const globalMaxLane = useMemo(() => {
        if (!tasks || !Array.isArray(tasks)) return 0;

        let maxLane = 0;
        scrollableDates.forEach(date => {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            tasks.forEach(task => {
                if (!task.start_time || !task.end_time) return;
                try {
                    const taskStart = new Date(normalizeToUTC(task.start_time));
                    const taskEnd = new Date(normalizeToUTC(task.end_time));

                    if (taskStart < dayEnd && taskEnd > dayStart) {
                        const lane = taskLanes.get(task.id) ?? 0;
                        maxLane = Math.max(maxLane, lane);
                    }
                } catch (e) { }
            });
        });
        return maxLane;
    }, [tasks, taskLanes, scrollableDates]);

    // Helper to get all strips for a specific date
    const getTasksForDate = (date) => {
        if (!tasks || !Array.isArray(tasks)) return { strips: [] };

        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const targetDateStr = toLocalISOString(date).split('T')[0];
        const dayTasks = [];

        tasks.forEach(task => {
            if (!task.start_time || !task.end_time) return;
            try {
                const taskStart = new Date(normalizeToUTC(task.start_time));
                const taskEnd = new Date(normalizeToUTC(task.end_time));

                if (taskStart < dayEnd && taskEnd > dayStart) {
                    const startLocalStr = toLocalISOString(taskStart).split('T')[0];
                    const endLocalStr = toLocalISOString(taskEnd).split('T')[0];

                    let width = 100;
                    let left = 0;

                    if (startLocalStr === targetDateStr && endLocalStr === targetDateStr) {
                        // Single day strip
                        const startHour = taskStart.getHours() + taskStart.getMinutes() / 60;
                        const endHour = taskEnd.getHours() + taskEnd.getMinutes() / 60;
                        left = (startHour / 24) * 100;
                        width = ((endHour - startHour) / 24) * 100;
                    } else if (startLocalStr === targetDateStr) {
                        // Multi-day start
                        const startHour = taskStart.getHours() + taskStart.getMinutes() / 60;
                        left = (startHour / 24) * 100;
                        width = 100 - left;
                    } else if (endLocalStr === targetDateStr) {
                        // Multi-day end
                        const endHour = taskEnd.getHours() + taskEnd.getMinutes() / 60;
                        width = (endHour / 24) * 100;
                        left = 0;
                    }

                    dayTasks.push({
                        ...task,
                        isStart: startLocalStr === targetDateStr,
                        isEnd: endLocalStr === targetDateStr,
                        isMiddle: targetDateStr > startLocalStr && targetDateStr < endLocalStr,
                        width: Math.max(5, width), // Ensure visible
                        left,
                        lane: taskLanes.get(task.id) ?? 0
                    });
                }
            } catch (e) { }
        });

        // Define color palette for different lanes
        const laneColors = [
            { gradient: 'linear-gradient(90deg, #38BDF8, #0EA5E9)', shadow: 'rgba(56, 189, 248, 0.3)' }, // Cyan
            { gradient: 'linear-gradient(90deg, #A78BFA, #8B5CF6)', shadow: 'rgba(139, 92, 246, 0.3)' }, // Purple
            { gradient: 'linear-gradient(90deg, #F472B6, #EC4899)', shadow: 'rgba(236, 72, 153, 0.3)' }, // Pink
            { gradient: 'linear-gradient(90deg, #FBBF24, #F59E0B)', shadow: 'rgba(245, 158, 11, 0.3)' }  // Amber
        ];

        // Build strips array - ONE slot per lane, containing all tasks for that lane
        const laneSlots = [];
        const MAX_VISIBLE_LANES = 3; // 0, 1, 2, 3 = 4 lanes
        const maxLaneToShow = Math.min(MAX_VISIBLE_LANES, globalMaxLane);

        for (let l = 0; l <= maxLaneToShow; l++) {
            const tasksInLane = dayTasks.filter(t => t.lane === l);
            const color = laneColors[l % laneColors.length];

            if (tasksInLane.length > 0) {
                // Create a lane slot with all its tasks
                laneSlots.push({
                    lane: l,
                    tasks: tasksInLane.map(t => ({ ...t, color })),
                    isSpacer: false
                });
            } else {
                // Empty lane slot (spacer to maintain height)
                laneSlots.push({
                    lane: l,
                    tasks: [],
                    isSpacer: true
                });
            }
        }

        const hasOverflow = dayTasks.some(t => t.lane > MAX_VISIBLE_LANES);

        return { laneSlots, overflow: hasOverflow };
    };

    return (
        <div className="calendar-strip" ref={scrollRef}>
            {scrollableDates.map((date, index) => {
                const isSelected = selectedDate.toDateString() === date.toDateString();
                const isToday = new Date().toDateString() === date.toDateString();
                const { laneSlots, overflow } = getTasksForDate(date);

                // Check if this is the last day of the month
                const isLastDayOfMonth = index < scrollableDates.length - 1 &&
                    date.getMonth() !== scrollableDates[index + 1].getMonth();

                return (
                    <>
                        <button
                            key={index}
                            onClick={() => onSelectDate(date)}
                            className={`calendar-day-btn ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                        >
                            <span className="day-name">{daysOfWeek[date.getDay()]}</span>
                            <span className="day-number">{date.getDate()}</span>

                            {/* Event Strips Stack - One row per lane */}
                            <div className="task-bars-container">
                                {laneSlots.map((slot, i) => (
                                    <div key={`lane-${slot.lane}`} className="task-lane-slot">
                                        {slot.isSpacer ? (
                                            <div className="task-bar spacer"></div>
                                        ) : (
                                            slot.tasks.map((task, taskIdx) => (
                                                <div
                                                    key={task.id || `${i}-${taskIdx}`}
                                                    className={`task-bar ${task.isStart ? 'start' : ''} ${task.isEnd ? 'end' : ''} ${task.isMiddle ? 'middle' : ''}`}
                                                    style={{
                                                        width: `${task.width}%`,
                                                        marginLeft: `${task.left}%`,
                                                        background: task.color?.gradient,
                                                        boxShadow: task.color?.shadow ? `0 2px 4px ${task.color.shadow}` : undefined,
                                                        position: slot.tasks.length > 1 ? 'absolute' : 'relative'
                                                    }}
                                                ></div>
                                            ))
                                        )}
                                    </div>
                                ))}
                                {overflow && <div className="task-bar-overflow"></div>}
                            </div>
                        </button>

                        {/* Month separator */}
                        {isLastDayOfMonth && (
                            <div className="month-separator">
                                <div className="month-separator-line"></div>
                                <span className="month-separator-label">
                                    {monthNames[scrollableDates[index + 1].getMonth()]}
                                </span>
                            </div>
                        )}
                    </>
                );
            })}
        </div>
    );
};

export default CalendarStrip;
