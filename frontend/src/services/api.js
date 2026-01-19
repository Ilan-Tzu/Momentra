import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const user = localStorage.getItem('momentra_user');
    if (user) {
        config.headers['X-User-Id'] = user;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const message = error.response?.data?.detail || error.response?.data?.error || error.message || "An unexpected error occurred";

        // Don't toast 409 Conflict errors as they are handled by the UI modal
        if (error.response?.status !== 409) {
            toast.error(`Error: ${message}`);
        }

        return Promise.reject(error);
    }
);

export const jobService = {
    createJob: async (rawText) => {
        // Include user's local time with timezone for accurate parsing
        const userLocalTime = new Date().toISOString().replace('Z', '') +
            (new Date().getTimezoneOffset() > 0 ? '-' : '+') +
            String(Math.abs(Math.floor(new Date().getTimezoneOffset() / 60))).padStart(2, '0') + ':' +
            String(Math.abs(new Date().getTimezoneOffset() % 60)).padStart(2, '0');

        const response = await api.post('/jobs', {
            raw_text: rawText,
            user_local_time: userLocalTime
        });
        return response.data;
    },

    parseJob: async (jobId) => {
        const response = await api.post(`/jobs/${jobId}/parse`);
        return response.data;
    },

    getJob: async (jobId) => {
        const response = await api.get(`/jobs/${jobId}`);
        return response.data;
    },

    acceptJob: async (jobId, data) => {
        const payload = Array.isArray(data) ? { selected_candidate_ids: data } : data;
        const response = await api.post(`/jobs/${jobId}/accept`, payload);
        return response.data;
    },

    updateJobCandidate: async (candidateId, updateData) => {
        const response = await api.patch(`/candidates/${candidateId}`, updateData);
        return response.data;
    },

    deleteJobCandidate: async (candidateId) => {
        await api.delete(`/candidates/${candidateId}`);
        return true;
    },

    googleLogin: async (idToken) => {
        const response = await api.post('/auth/google', { id_token: idToken });
        return response.data;
    },

    transcribeAudio: async (audioBlob) => {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        const response = await api.post('/transcribe', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        });
        return response.data;
    },

    getTasks: async (startDate, endDate) => {
        const response = await api.get('/tasks', {
            params: {
                start_date: startDate,
                end_date: endDate
            }
        });
        return response.data;
    },

    updateTask: async (id, updateData) => {
        const response = await api.patch(`/tasks/${id}`, updateData);
        return response.data;
    },

    deleteTask: async (id) => {
        await api.delete(`/tasks/${id}`);
    }
};

export default api;
