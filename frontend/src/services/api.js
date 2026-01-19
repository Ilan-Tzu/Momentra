import axios from 'axios';
import toast from 'react-hot-toast';
import { getAccessToken, getRefreshToken, setTokens, clearTokens, shouldRefreshToken } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Flag to prevent multiple simultaneous refresh requests
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Request interceptor - attach JWT token
api.interceptors.request.use(
    async (config) => {
        // Check if token needs refresh before making request
        if (shouldRefreshToken() && !isRefreshing) {
            try {
                await refreshAccessToken();
            } catch (error) {
                console.error('Token refresh failed:', error);
                // Continue with request anyway, backend will reject if needed
            }
        }

        const token = getAccessToken();
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - handle 401 and auto-refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If 401 and we haven't tried to refresh yet
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                // Queue this request to retry after refresh completes
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = getRefreshToken();

            if (!refreshToken) {
                // No refresh token, redirect to login
                clearTokens();
                window.location.href = '/';
                return Promise.reject(error);
            }

            try {
                const response = await axios.post(`${API_URL}/auth/refresh`, {
                    refresh_token: refreshToken
                });

                const { access_token } = response.data;

                // Update access token (keep existing refresh token and user)
                const currentRefreshToken = getRefreshToken();
                const user = JSON.parse(localStorage.getItem('momentra_user'));
                setTokens(access_token, currentRefreshToken, user);

                // Update the failed request with new token
                originalRequest.headers['Authorization'] = 'Bearer ' + access_token;

                processQueue(null, access_token);
                isRefreshing = false;

                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                isRefreshing = false;

                // Refresh failed, clear tokens and redirect to login
                clearTokens();
                window.location.href = '/';
                return Promise.reject(refreshError);
            }
        }

        // Handle other errors
        const message = error.response?.data?.detail || error.response?.data?.error || error.message || "An unexpected error occurred";

        // Don't toast 409 Conflict errors as they are handled by the UI modal
        if (error.response?.status !== 409) {
            toast.error(`Error: ${message}`);
        }

        return Promise.reject(error);
    }
);

// Standalone refresh function (can be called manually)
const refreshAccessToken = async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    const response = await axios.post(`${API_URL}/auth/refresh`, {
        refresh_token: refreshToken
    });

    const { access_token } = response.data;
    const currentRefreshToken = getRefreshToken();
    const user = JSON.parse(localStorage.getItem('momentra_user'));

    setTokens(access_token, currentRefreshToken, user);
    return access_token;
};

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
