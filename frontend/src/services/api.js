import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000/api/v1';

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

export const jobService = {
    createJob: async (rawText) => {
        const response = await api.post('/jobs', { raw_text: rawText });
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

    acceptJob: async (jobId, candidateIds) => {
        const response = await api.post(`/jobs/${jobId}/accept`, { selected_candidate_ids: candidateIds });
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

    register: async (username, password) => {
        const response = await api.post('/auth/register', { username, password });
        return response.data;
    },

    login: async (username, password) => {
        const response = await api.post('/auth/login', { username, password });
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
