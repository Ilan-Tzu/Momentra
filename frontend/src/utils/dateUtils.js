/**
 * TIMEZONE STRATEGY (Momentra)
 * ============================
 * 
 * RULE: Database & Backend ALWAYS run in UTC. No exceptions.
 *       Frontend converts UTC → Local Time for display.
 * 
 * Data Flow:
 * 1. User Input (Local) → toUTC() → Backend (stores as naive UTC)
 * 2. Backend (naive UTC) → normalizeToUTC() → formatToLocalTime() → Display (Local)
 * 
 * Key Functions:
 * - normalizeToUTC(str): Appends 'Z' to naive UTC strings from backend
 * - formatToLocalTime(isoZ): Converts UTC ISO to local HH:MM display
 * - toUTC(localIso): Converts local datetime-local input to UTC ISO
 * - toLocalISOString(date): Formats Date object as local YYYY-MM-DDTHH:MM:SS
 */

export const formatToLocalTime = (isoString, use24HourFormat = false) => {
    if (!isoString) return '00:00';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '00:00';
        return d.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: !use24HourFormat
        });
    } catch (e) {
        return '00:00';
    }
};

export const toLocalISOString = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const pad = (num) => String(num).padStart(2, '0');
    return d.getFullYear() +
        '-' + pad(d.getMonth() + 1) +
        '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) +
        ':' + pad(d.getMinutes()) +
        ':' + pad(d.getSeconds());
};

export const normalizeToUTC = (isoString) => {
    if (!isoString) return null;
    // If it already has 'Z' or a timezone offset like +02:00 or -0500, don't append Z
    if (isoString.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(isoString)) return isoString;

    // For naive strings from our backend (which are UTC), append Z
    return isoString + 'Z';
};

export const toUTC = (localIso) => {
    if (!localIso) return null;
    // If it's already an explicit UTC string, return it
    if (localIso.endsWith('Z')) return localIso;

    // Otherwise, parse as local and convert to UTC ISO
    const d = new Date(localIso);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
};

export const formatToLocalDate = (dateObj) => {
    // For calendar strip comparison
    // Returns YYYY-MM-DD in local time
    const pad = (num) => String(num).padStart(2, '0');
    return dateObj.getFullYear() +
        '-' + pad(dateObj.getMonth() + 1) +
        '-' + pad(dateObj.getDate());
};

export const handleTimeShift = (timeStr, deltaMinutes, dateStr = null) => {
    if (!timeStr) return dateStr ? { time: '09:00', date: dateStr } : '09:00';

    // Default to today if dateStr is not provided
    const baseDate = dateStr || new Date().toISOString().split('T')[0];
    const [h, m] = timeStr.split(':').map(Number);

    // Create date object in LOCAL time
    const d = new Date(baseDate.replace(/-/g, '/')); // Use / for better cross-browser compatibility with date-only strings
    d.setHours(h, m + deltaMinutes);

    const pad = (num) => String(num).padStart(2, '0');
    const newTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const newDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (dateStr) {
        return { time: newTime, date: newDate };
    }
    return newTime;
};
