import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000/api/v1';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
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
    }
};

export default api;
