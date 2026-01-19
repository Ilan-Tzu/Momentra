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

export const formatToLocalTime = (isoString) => {
    if (!isoString) return '00:00';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '00:00';
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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

export const toUTC = (localIso) => {
    if (!localIso) return null;
    if (localIso.endsWith('Z')) return localIso;
    const d = new Date(localIso);
    return d.toISOString();
};

export const normalizeToUTC = (isoString) => {
    if (!isoString) return null;
    if (isoString.endsWith('Z')) return isoString;
    // Assume input is UTC if missing Z? 
    // NO! Existing code appended Z to naive strings from backend.
    // If backend returns "2026-06-26T11:00:00", it implies UTC (from previous fixes).
    // So append Z.
    return isoString + 'Z';
};

export const formatToLocalDate = (dateObj) => {
    // For calendar strip comparison
    // Returns YYYY-MM-DD in local time
    const pad = (num) => String(num).padStart(2, '0');
    return dateObj.getFullYear() +
        '-' + pad(dateObj.getMonth() + 1) +
        '-' + pad(dateObj.getDate());
};

export const handleTimeShift = (timeStr, deltaMinutes) => {
    if (!timeStr) return '09:00';
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + deltaMinutes);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};
