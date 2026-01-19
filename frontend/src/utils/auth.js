/**
 * Authentication Utilities
 * =======================
 * 
 * Handles JWT token storage, retrieval, and validation.
 */

const TOKEN_KEYS = {
    ACCESS: 'momentra_access_token',
    REFRESH: 'momentra_refresh_token',
    USER: 'momentra_user'
};

/**
 * Store authentication tokens and user data
 */
export const setTokens = (accessToken, refreshToken, user) => {
    localStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
    localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
    localStorage.setItem(TOKEN_KEYS.USER, JSON.stringify(user));
};

/**
 * Get access token
 */
export const getAccessToken = () => {
    return localStorage.getItem(TOKEN_KEYS.ACCESS);
};

/**
 * Get refresh token
 */
export const getRefreshToken = () => {
    return localStorage.getItem(TOKEN_KEYS.REFRESH);
};

/**
 * Get stored user data
 */
export const getUser = () => {
    const userStr = localStorage.getItem(TOKEN_KEYS.USER);
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch (e) {
        console.error('Failed to parse user data:', e);
        return null;
    }
};

/**
 * Clear all authentication data (logout)
 */
export const clearTokens = () => {
    localStorage.removeItem(TOKEN_KEYS.ACCESS);
    localStorage.removeItem(TOKEN_KEYS.REFRESH);
    localStorage.removeItem(TOKEN_KEYS.USER);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
    return !!getAccessToken();
};

/**
 * Decode JWT token payload (without verification)
 * Used to check expiration client-side
 */
export const decodeToken = (token) => {
    if (!token) return null;

    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Failed to decode token:', e);
        return null;
    }
};

/**
 * Check if token is expired
 */
export const isTokenExpired = (token) => {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    // Check if token expires in less than 60 seconds
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const bufferTime = 60 * 1000; // 60 seconds buffer

    return currentTime >= (expirationTime - bufferTime);
};

/**
 * Check if access token needs refresh
 */
export const shouldRefreshToken = () => {
    const accessToken = getAccessToken();
    if (!accessToken) return false;

    return isTokenExpired(accessToken);
};
